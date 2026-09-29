import {gzipSync, strToU8} from 'fflate';
import {toByteArray, fromByteArray} from 'base64-js';

import {aosToSoa, aosToSoaInclusive, soaToAos} from './utils/utils';
import {LAYOUT} from './utils/constants';

export async function makeSaveableTabState(tab, saveData) {
    const saveTab = {...tab}
    delete saveTab['id'];
    delete saveTab['_external_id'];
    delete saveTab['_old_external_id'];
    delete saveTab['closeTab'];
    delete saveTab['heatmapDataObject'];

    saveTab.hideColumns = saveTab.hideColumns ? Array.from(saveTab.hideColumns) : null;
    saveTab.selection = saveTab.selection ? Array.from(saveTab.selection) : null;
    saveTab.selectedColumns = saveTab.selectedColumns?.map((cs) => cs ? Array.from(cs) : undefined) ?? null;
    saveTab.columnFilter = saveTab.columnFilter?.map((cf) => cf ? Array.from(cf) : undefined) ?? null;
    saveTab.filter = saveTab.filter ? Array.from(saveTab.filter) : null;

    if (saveData || (tab._gyde_format_version||0) < 200002) {
        if (!saveData) {
            console.log('*** Forcing full save due to version upgrade')
            saveData = true;
        }

        if (saveData instanceof Array) {
            saveTab.columnarData = {};
            for (const c of saveData) {
                saveTab.columnarData[c] = tab.columnarData[c];
            }
        }

        saveTab._gyde_format_version = tab._gyde_format_version = 200002;
    } else {
        // console.log('doing light save');
        delete saveTab['columnarData'];
    }

    const blobCache = {},
          encodedBlobs = {};

    async function cacheBlob(column, blob) {
        if (!blobCache[column]) blobCache[column] = [];
        if (!encodedBlobs[column]) encodedBlobs[column] = [];

        for (let i = 0; i < blobCache[column].length; ++i) {
            if (blob === blobCache[column][i]) {
                return {_gyde_colblob_: {index: i}};
            }
        }

        blobCache[column].push(blob);
        const blobData = await blob.arrayBuffer();
        const encBlob = {data: fromByteArray(new Uint8Array(blobData))};
        if (blob.type) {
            encBlob.type = blob.type;
        }
        let hasProps = false;
        const blobProps = {};
        for (const [k,v] of Object.entries(blob)) {
            if (typeof(k) === 'string' && (k.startsWith('gyde_') || k.startsWith('_gyde_'))) {
                blobProps[k] = v;
                hasProps = true;
            }
        }
        if (hasProps) encBlob.props = blobProps;
        encodedBlobs[column].push(encBlob);
        return {_gyde_colblob_: {index: blobCache[column].length - 1}};
    }


    const objCache = {};

    function cacheObjCompare(a, b) {
        if (a === b) return true;
        if (a instanceof Array && a.length < 20) {
            if (b instanceof Array && b.length === a.length) {
                for (let i = 0; i < a.length; ++i) {
                    if (a[i] !== b[i]) return false;
                }
                return true;
            }
        }
        return false;
    }

    function cacheObj(column, obj) {
        if (!objCache[column]) objCache[column] = [];

        for (let i = 0; i < objCache[column].length; ++i) {
            if (cacheObjCompare(obj, objCache[column][i])) {
                return {_gyde_obj_: {index: i}};
            }
        }

        objCache[column].push(obj);
        return {_gyde_obj_: {index: objCache[column].length - 1}};
    }

    async function encodeBlobs(saveTab) {
        if (!saveTab.columnarData) return;

        saveTab.columnarData = {...saveTab.columnarData};
        for (const column of Object.keys(saveTab.columnarData)) {
            if (column === 'predicted_structure') {
                saveTab.columnarData[column] = [];
            } else if (saveTab.columnarData[column]) {  // Because the key Object.keys doesn't guarantee a value
                saveTab.columnarData[column] = [...saveTab.columnarData[column]];
                for (let i = 0; i < saveTab.columnarData[column].length; ++i) {
                    const v = saveTab.columnarData[column][i];
                    if (v instanceof Blob) {
                        const blobHolder = await cacheBlob(column, v);
                        saveTab.columnarData[column][i] = blobHolder;
                    } else if (v && typeof(v) === 'object') {
                        saveTab.columnarData[column][i] = cacheObj(column, v);
                    }
                }
            }
        }
    }

    await encodeBlobs(saveTab);
    saveTab.encodedBlobColumns = encodedBlobs;
    saveTab.objColumns = objCache;

    return gzipSync(strToU8(JSON.stringify(saveTab)));
}

export function hydrateTabState(tabData) {
    const {
        data,        // Only for backward compatibility
        columnarData,
        columnarDataRows,
        selection,
        selectedColumns,
        filter,
        columnFilter,
        hideColumns,
        encodedBlobs,       // eventually for backwards compat
        encodedBlobColumns,
        objColumns={},      // Added v200000 format
        ...sessionProps
    } = tabData;

    if ((sessionProps._gyde_format_version || 0) <= 1000) {
        return hydrateTabStateV1000(tabData)
    } 

    if (sessionProps._gyde_format_version < 100000 || sessionProps._gyde_format_version >= 290000) {
        throw Error('Unexpected experimental GYDE format version')
    }


    const blobCache = {};

    for (const [col, encBlobs] of Object.entries(encodedBlobColumns || {})) {
        blobCache[col] = (encBlobs || []).map(({data, type, props: blobProps}) => {
            const props = {};
            if (type) props.type = type;
            const b = new Blob([toByteArray(data).buffer], props);
            if (blobProps) {
                Object.assign(b, blobProps);
            }
            return b;
        });
    }

    if (columnarData) {
        for (const [col, colData] of Object.entries(columnarData)) {
            for (let i = 0; i < colData.length; ++i) {
                const v = colData[i];
                if (v?._gyde_colblob_) {
                    colData[i] = blobCache[col][v._gyde_colblob_.index];
                } else if (v?._gyde_obj_) {
                    colData[i] = objColumns[col][v._gyde_obj_.index];
                }
            }
        }
        if (!sessionProps.dataColumns) sessionProps.dataColumns = Object.keys(columnarData)
    }

    delete sessionProps['heatmapDataObject']; // v0.4.0 would erroneously save this.
                                              // make sure it doesn't get restored.
    delete sessionProps['mafftPending'];      // Never restore in-progress MAFFT state;
                                              // alignment will be re-triggered if needed.

    // Development versions used strings rather than objects to represent variants.  There
    // shoudln't be any such datasets on the PROD server, but clearing these out (and bumping
    // format version) for ease of development.
    if (sessionProps._gyde_format_version < 200001) {
        delete sessionProps['acceptedVariants'];
    }

    const vs = sessionProps['visibleStructures']
    if (!vs) {
        sessionProps['visibleStructures'] = ['structure_url']
    } else if (!Array.isArray(vs)) {
        sessionProps['visibleStructures'] = Object.entries(vs).filter(([k, v]) => v).map(([k, v]) => k);
    }

    return {
        ...sessionProps,
        columnarData: columnarData,
        selection: new Set(selection instanceof Array ? selection : []),
        selectedColumns: selectedColumns?.map((cs) => cs && new Set(cs)),
        columnFilter: columnFilter?.map((cf) => cf && new Set(cf)),
        filter: filter instanceof Array ? new Set(filter) : undefined,
        hideColumns: hideColumns instanceof Array ? new Set(hideColumns) : undefined
    };
}


export function hydrateTabStateV1000(tabData) {
    const {
        data,
        dataColumns,
        alignedHeavy, alignedHeavyRN,
        alignedLight, alignedLightRN,
        anarciHeavy, anarciHeavyRN,
        anarciLight, anarciLightRN,
        selection,
        heavySelectedColumns,
        lightSelectedColumns,
        filter,
        encodedBlobs,
        ...sessionProps
    } = tabData;


    data.columns = dataColumns;
    if (alignedHeavy) alignedHeavy.residueNumbers = alignedHeavyRN;
    if (alignedLight) alignedLight.residueNumbers = alignedLightRN;
    if (anarciHeavy) anarciHeavy.residueNumbers = anarciHeavyRN;
    if (anarciLight) anarciLight.residueNumbers = anarciLightRN;

    const blobCache = (encodedBlobs || []).map(({data, type}) => {
        const props = {};
        if (type) props.type = type;
        return new Blob([toByteArray(data).buffer], props);
    });

    for (const d of data) {
        for (const [k, v] of Object.entries(d)) {
            if (v && v._gyde_blob_) {
                if (typeof(v._gyde_blob_.index) === 'number') {
                    d[k] = blobCache[v._gyde_blob_.index];
                } else {
                    const props = {};
                    if (v._gyde_blob_.type) props.type = v._gyde_blob_.type;
                    d[k] = new Blob([toByteArray(v._gyde_blob_.data).buffer], props);
                }
            }
        }
    }

    if (sessionProps._gyde_format_version >= 1000) {
        if (sessionProps.germlineLight) {
            sessionProps.germlineLight = sessionProps.germlineLight.map(({alignment, ...glProps}) => ({...glProps, alignment: soaToAos(alignment)}));
        }
        if (sessionProps.germlineHeavy) {
            sessionProps.germlineHeavy = sessionProps.germlineHeavy.map(({alignment, ...glProps}) => ({...glProps, alignment: soaToAos(alignment)}));
        }
    }

    if (sessionProps._gyde_format_version <= 1000 && !sessionProps.seqColumns) {
        sessionProps.seqColumns = [];
        if (data.columns.indexOf('HC_sequence') >= 0) sessionProps.seqColumns.push('HC_sequence');
        if (data.columns.indexOf('LC_sequence') >= 0) sessionProps.seqColumns.push('LC_sequence');
    }

    const columnarData = aosToSoaInclusive(data);

    if ((sessionProps.dataFields || []).indexOf('Names') < 0) {
        sessionProps.dataFields = ['Names', ...(sessionProps.dataFields || [])];
    }

    if ((sessionProps.msaDataFields || []).indexOf('Names') < 0) {
        sessionProps.msaDataFields = ['Names', ...(sessionProps.msaDataFields || [])];
    }

    if (!sessionProps.seqColumns) {
        sessionProps.seqColumns = [];
        if (columnarData['HC_sequence']) sessionProps.seqColumns.push('HC_sequence');
        if (columnarData['LC_sequence']) sessionProps.seqColumns.push('LC_sequence');
    }
    sessionProps.seqColumns = sessionProps.seqColumns.map((column) => ((column instanceof String) ? ({column}) : column));

    if (alignedLight || alignedHeavy) {
        sessionProps.msaColumns = sessionProps.seqColumns.map(({column}) => {
            let align = null;
            if (column === 'HC_sequence') align = alignedHeavy;
            if (column === 'LC_sequence') align = alignedLight;
            if (align) {
                const msaColName = '_gyde_msa_' + column;
                columnarData[msaColName] = align.map(({seq}) => seq);
                return {
                    column: msaColName,
                    numbering: align.residueNumbers
                };
            }
        });
    }

/*  We don't attempt to restore numbering alignments, because enough details have changed since pre-columnar
    GYDE (in particular, the point where seed comparisons are done). 

    if (anarciLight || anarciHeavy) {
        sessionProps.abNumColumns = sessionProps.seqColumns.map(({column}) => {
            let align = null;
            if (column === 'HC_sequence') align = anarciHeavy;
            if (column === 'LC_sequence') align = anarciLight;
            if (align) {
                const msaColName = '_gyde_abNum_' + column;
                columnarData[msaColName] = align.map(({seq}) => seq);
                return {
                    column: msaColName,
                    numbering: align.residueNumbers
                };
            }
        });

        sessionProps.abNumRefColumns = sessionProps.seqColumns.map(({column}) => {
            let align = null;
            if (column === 'HC_sequence') align = anarciHeavy;
            if (column === 'LC_sequence') align = anarciLight;
            if (align) {
                const msaColName = '_gyde_abNumRef_' + column;
                columnarData[msaColName] = align.map(({germLine}) => seq);
                return {
                    column: msaColName,
                    numbering: align.residueNumbers
                };
            }
        });
    }
    */

    if (sessionProps.isAntibody) {
        sessionProps.seqColumns.forEach(({column}) => {
            if (column === 'HC_sequence') sessionProps.hcColumn = column;
            if (column === 'LC_sequence') sessionProps.lcColumn = column;
        });
    }

    return {
        ...sessionProps,
        storedAlignment: null,    // We always want to re-run numbering alignments on Ab datasets.
        columnarData,
        dataColumns,
        dataRowCount: data.length,
        //alignedHeavy,
        // alignedLight,
        // anarciHeavy,
        // anarciLight,
        selection: new Set(selection instanceof Array ? selection : []),
        // No attempt to preserve column selections: low value...
        // heavySelectedColumns: new Set(heavySelectedColumns instanceof Array ? heavySelectedColumns : []),
        // lightSelectedColumns: new Set(heavySelectedColumns instanceof Array ? lightSelectedColumns : []),
        filter: filter instanceof Array ? new Set(filter) : undefined
    };
}
