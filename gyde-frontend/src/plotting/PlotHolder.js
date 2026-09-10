import React from 'react';

import {TextField, MenuItem, Grid, Card, CardContent, Button, Checkbox, FormControlLabel} from '@mui/material';
import {Edit as EditIcon, GetApp as DownloadIcon} from '@mui/icons-material';

import memoize from 'memoize-one';
import {saveAs} from 'file-saver';

import Histogram from './Histogram';
import Scatter from './Scatter';
import StructureHolder from '../structureView/StructureHolder';

export class PlotController extends React.Component {
    constructor(props) {
        super(props);

        this.setAxis1 = this.setAxis1.bind(this);
        this.setAxis2 = this.setAxis2.bind(this);
        this.setAxis3 = this.setAxis3.bind(this);
        this.setAxis1Log = this.setAxis1Log.bind(this);
        this.setAxis2Log = this.setAxis2Log.bind(this);
        this.setAxis3Log = this.setAxis3Log.bind(this);
        this.setShowFiltered = this.setShowFiltered.bind(this);

        this.state = {
            editing: false
        };
    }

    setAxis1(ev) {
        const val = ev.target.value;
        if (val.startsWith('special:')) {
            this.props.updateProps({
                axis1: null,
                special: val.split(':')[1]
            });
        } else {
            const vc = this.validColumns(this.props.columnarData, this.props.dataColumns, this.props.columnTypes);
            const col = vc.find((c) => c.name === val);
            if (!col) return;
            this.props.updateProps({
                axis1: {series: col.name, categorical: col.categorical},
                special: null
            });
        }
    }

    setAxis2(ev) {
        const val = ev.target.value;
        const vc = this.validColumns(this.props.columnarData, this.props.dataColumns, this.props.columnTypes);
        const col = vc.find((c) => c.name === val);
        const update = {axis2: ev.target.value ? {series: val} : null};
        if (!val) update['axis3'] = undefined;
        this.props.updateProps(update);
    }

    setAxis3(ev) {
        const val = ev.target.value;
        const vc = this.validColumns(this.props.columnarData, this.props.dataColumns, this.props.columnTypes);
        const col = vc.find((c) => c.name === val);
        this.props.updateProps({axis3: val ? {series: val, categorical: col?.categorical} : null})
    }

    setAxis1Log(ev) {
        if (this.props.axis1) {
            this.props.updateProps({
                axis1: {...this.props.axis1, transform: ev.target.checked ? 'log': 'linear'}
            });
        }
    }

    setAxis2Log(ev) {
        if (this.props.axis2) {
            this.props.updateProps({
                axis2: {...this.props.axis2, transform: ev.target.checked ? 'log': 'linear'}
            });
        }
    }

    setAxis3Log(ev) {
        if (this.props.axis3) {
            this.props.updateProps({
                axis3: {...this.props.axis3, transform: ev.target.checked ? 'log': 'linear'}
            });
        }
    }

    updateAxisLimit(axis, axisProp, axisTextProp, val) {
        const m = /-?\d*(\.\d*)?([Ee]-?\d*\.?\d*)?/.exec(val);
        if (m) {
            val = m[0];
        } else {
            val = '';
        }
        let num = parseFloat(val);
        if (Number.isNaN(num)) {num=undefined; val=(val === '-' ? '-' : undefined)};

        this.props.updateProps((oldProps) => ({
            ...oldProps,
            [axis]: {
                ...oldProps[axis],
                [axisTextProp]: val,
                [axisProp]: num
            }
        }));
    }

    setShowFiltered(ev) {
        this.props.updateProps({
            hideFiltered: !ev.target.checked
        });
    }

    render() {
        const {axis1, axis2, axis3, special, hideFiltered, ...rest} = this.props;
        let title = this.props.title;

        const validColumns = this.validColumns(this.props.columnarData, this.props.dataColumns, this.props.columnTypes);

        const a1d = this.axis1Data(axis1, this.props.columnarData),
              a2d = this.axis2Data(axis2, this.props.columnarData),
              a3d = this.axis3Data(axis3, this.props.columnarData);

        let plot = false;
        if (special === 'structure') {
            plot = true;
            title ||= 'Structure';
        } else if (a1d && a2d) {
            plot = true;
            let derivedTitle = this.axis2Name(axis2, this.props.columnDisplayNames) + ' vs. ' + this.axis1Name(axis1, this.props.columnDisplayNames);
            if (a3d) {
                derivedTitle += ' coloured by ' + this.axis3Name(axis3, this.props.columnDisplayNames);
            }
            title ||= derivedTitle;
        } else if (a1d) {
            title ||= this.axis1Name(axis1,  this.props.columnDisplayNames);
            plot = true;
        }

        const xkey = special ? 'special:'+special : axis1?.series || axis1;
        const ykey = axis2?.series || axis2;
        const zkey = axis3?.series || axis3;

        return (
            <React.Fragment>
                <h4>
                    {plot ? title : null}
                    <Button onClick={ () => this.setState((oldState) => ({editing: !oldState.editing})) }>
                        <EditIcon />   
                        { plot ? null : "Click to select data" }
                    </Button>
                    <Button disabled={!plot} onClick={ () => this.props.export() }>
                        <DownloadIcon />   
                    </Button>
                </h4>
                <Card variant="outlined" style={{display: (this.state.editing) ? null : 'none'}} >
                    <CardContent>
                        <Grid container spacing={2} style={{paddingLeft: '1em', paddingRight: '1em'}}>
                            <Grid item xs={12}>
                                <TextField id="sel-axis-1"
                                           label="X-axis data"
                                           value={validColumns.find((c) => c.name === xkey) ? xkey : ''}
                                           onChange={this.setAxis1}
                                           fullWidth
                                           select>
                                    { validColumns.map((col, idx) => (
                                        <MenuItem key={idx} value={col.name}>
                                            {(this.props.columnDisplayNames[col.name] ?? col.name)  + (col.categorical ? ' [CATEGORICAL]' : '')}
                                        </MenuItem>
                                    )) }
                                </TextField>
                            </Grid>
                            <Grid item xs={4}>
                                <FormControlLabel
                                  control={<Checkbox name="logaxis1"  disabled={!xkey || axis1?.categorical} checked={axis1?.transform === 'log'} onChange={this.setAxis1Log} />}
                                  label="Log-scale" />
                            </Grid>
                            <Grid item xs={4}>
                                <TextField id="min-axis-1"
                                           label="Minimum"
                                           disabled={!xkey || axis1?.categorical}
                                           onChange={(ev) => this.updateAxisLimit('axis1', 'min', 'minText', ev.target.value)}
                                           value={axis1?.categorical ? '' : axis1?.minText || ''}
                                           fullWidth />
                            </Grid>
                            <Grid item xs={4}>
                                <TextField id="max-axis-1"
                                           label="Maximum"
                                           disabled={!xkey || axis1?.categorical}
                                           onChange={(ev) => this.updateAxisLimit('axis1', 'max', 'maxText', ev.target.value)}
                                           value={axis1?.categorical ? '' : axis1?.maxText || ''}
                                           fullWidth />
                            </Grid>
                            <Grid item xs={12}>
                                {!special &&
                                    <TextField id="sel-axis-2"
                                               label="Y-axis data"
                                               value={validColumns.find((c) => c.name === ykey) ? ykey : ''}
                                               onChange={this.setAxis2}
                                               fullWidth
                                               select>
                                        <MenuItem value={null}>- (Density plot)</MenuItem>
                                        { validColumns.filter((c) => !c.categorical).map((col, idx) => (
                                            <MenuItem key={idx} value={col.name}>{(this.props.columnDisplayNames[col.name] ?? col.name)}</MenuItem>
                                        )) }
                                    </TextField> }
                            </Grid>
                            <Grid item xs={4}>
                                <FormControlLabel
                                  control={<Checkbox name="logaxis2" checked={axis2?.transform === 'log'} onChange={this.setAxis2Log} />}
                                  label="Log-scale" />
                            </Grid>
                            <Grid item xs={4}>
                                <TextField id="min-axis-2"
                                           label="Minimum"
                                           disabled={!xkey || !ykey}
                                           onChange={(ev) => this.updateAxisLimit('axis2', 'min', 'minText', ev.target.value)}
                                           value={axis2?.minText || ''}
                                           fullWidth />
                            </Grid>
                            <Grid item xs={4}>
                                <TextField id="max-axis-2"
                                           label="Maximum"
                                           disabled={!xkey || !ykey}
                                           onChange={(ev) => this.updateAxisLimit('axis2', 'max', 'maxText', ev.target.value)}
                                           value={axis2?.maxText || ''}
                                           fullWidth />
                            </Grid>
                            <Grid item xs={12}>
                                <TextField id="sel-axis-3"
                                           label="Colour points by data series"
                                           disabled={!xkey || !ykey}
                                           value={validColumns.find((c) => c.name === zkey) ? zkey : ''}
                                           onChange={this.setAxis3}
                                           fullWidth
                                           select>
                                    <MenuItem value={null}>- (None)</MenuItem>
                                    { validColumns.map((col, idx) => (
                                        <MenuItem key={idx} value={col.name}>
                                            {(this.props.columnDisplayNames[col.name] ?? col.name)  + (col.categorical ? ' [CATEGORICAL]' : '')}
                                        </MenuItem>
                                    )) }
                                </TextField> 
                            </Grid>
                            <Grid item xs={4}>
                                <FormControlLabel
                                  control={<Checkbox name="logaxis3" checked={axis3?.transform === 'log'} disabled={!xkey || !ykey || !zkey} onChange={this.setAxis3Log} />}
                                  label="Log-scale" />
                            </Grid>
                            <Grid item xs={4}>
                                <TextField id="min-axis-3"
                                           label="Minimum"
                                           disabled={!xkey || !ykey || !zkey}
                                           onChange={(ev) => this.updateAxisLimit('axis3', 'min', 'minText', ev.target.value)}
                                           value={axis3?.minText || ''}
                                           fullWidth />
                            </Grid>
                            <Grid item xs={4}>
                                <TextField id="max-axis-3"
                                           label="Maximum"
                                           disabled={!xkey || !ykey || !zkey}
                                           onChange={(ev) => this.updateAxisLimit('axis3', 'max', 'maxText', ev.target.value)}
                                           value={axis3?.maxText || ''}
                                           fullWidth />
                            </Grid>
                            <Grid item xs={12}>
                                <FormControlLabel
                                  control={<Checkbox name="showfilt" checked={!hideFiltered} onChange={this.setShowFiltered} />}
                                  label="Show filtered data points (in gray)" />
                            </Grid>
                        </Grid>
                    </CardContent>
                </Card>
            </React.Fragment>
        );
    }

    axis1Data = memoize(axisData);
    axis2Data = memoize(axisData);
    axis3Data = memoize(axisData);
    axis1Name = memoize(axisName);
    axis2Name = memoize(axisName);
    axis3Name = memoize(axisName);
    validColumns = memoize(validColumns);
}

export default class PlotHolder extends React.Component {
    constructor(props) {
        super(props);

        this.onZoom = this.onZoom.bind(this);
    }

    render() {
        const {axis1, axis2, axis3, special, nameColumn='concept_name', refNameColumn='seed', ...rest} = this.props;
        let title = this.props.title;
        const columnarData = this.props.columnarData;

        const a1d = this.axis1Data(axis1, this.props.columnarData),
              a2d = this.axis2Data(axis2, this.props.columnarData),
              a3d = this.axis3Data(axis3, this.props.columnarData);

        let plot = null;

        if (special === 'structure') {
            plot = (
                <StructureHolder {...rest} />
            )
            title ||= 'Structure';
        } else if (a1d && a2d) {
            plot = (
                <Scatter x={a1d}
                         minX={axis1?.min}
                         maxX={axis1?.max}
                         y={a2d}
                         minY={axis2?.min}
                         maxY={axis2?.max}
                         colourBy={a3d}
                         logColourBy={axis3?.transform === 'log'}
                         minColourBy={axis3?.min}
                         maxColourBy={axis3?.max}
                         categorical={axis1?.categorical}
                         pairedCategoryFn={axis1?.series === refNameColumn ? (i) => (columnarData[nameColumn][i] ? columnarData[nameColumn][i].split('.')[0] : null) === columnarData[refNameColumn][i] : undefined}
                         logX={axis1?.transform === 'log'}
                         logY={axis2?.transform === 'log'}
                         xAxisName={this.axis1Name(axis1,  this.props.columnDisplayNames)}
                         yAxisName={this.axis2Name(axis2,  this.props.columnDisplayNames)}
                         colourByAxisName={this.axis3Name(axis3,  this.props.columnDisplayNames)}
                         colourByCategorical={axis3?.categorical}
                         onZoom={this.onZoom}
                         {...rest} />
            );
            title ||= this.axis2Name(axis2,  this.props.columnDisplayNames) + ' vs. ' + this.axis1Name(axis1,  this.props.columnDisplayNames);
        } else if (a1d) {
            title ||= this.axis1Name(axis1,  this.props.columnDisplayNames);
            plot = (
                <Histogram x={a1d}
                           minX={axis1?.min}
                           maxX={axis1?.max}
                           categorical={axis1?.categorical}
                           logX={axis1?.transform === 'log'}
                           onZoom={this.onZoom}
                           {...rest} />
            );
        }

        const xkey = special ? 'special:'+special : axis1?.series || axis1;
        const ykey = axis2?.series || axis2

        return (
            <React.Fragment>
                { plot }
            </React.Fragment>
        );

    }

    onZoom(minAxis1, maxAxis1, minAxis2, maxAxis2) {
        const {axis1, axis2, axis3, special, ...rest} = this.props;

        this.props.updateProps((oldProps) => ({
            axis1: oldProps.axis1 && {
                ...oldProps.axis1,
                min: minAxis1,
                minText: typeof(minAxis1) === 'number' ? minAxis1.toString() : '',
                max: maxAxis1,
                maxText: typeof(maxAxis1) === 'number' ? maxAxis1.toString() : ''
            },
            axis2: oldProps.axis2 && {
                ...oldProps.axis2,
                min: minAxis2,
                minText: typeof(minAxis2) === 'number' ? minAxis2.toString() : '',
                max: maxAxis2,
                maxText: typeof(maxAxis2) === 'number' ? maxAxis2.toString() : ''
            }
        }));
    }

    axis1Data = memoize(axisData);
    axis2Data = memoize(axisData);
    axis3Data = memoize(axisData);
    axis1Name = memoize(axisName);
    axis2Name = memoize(axisName);
    axis3Name = memoize(axisName);
}

function axisData(def, columnarData) {
    if (typeof(def) === 'string') {
        def = {series: def, transform: 'linear'};
    }

    if (!def) return;
    const {series, transform = 'linear'} = def;

    let data = columnarData[series] || [];
    if (transform === 'linear') {
        return data;
    } else if (transform === 'log') {
        return data;
    } else if (transform === 'negLog10') {
        return data.map((d) => -Math.log10(d));
    } else {
        throw Error(`No support for transform ${transform}`)
    }

}

function axisName(def, columnDisplayNames={}) {
    if (typeof(def) === 'string') {
        def = {series: def, transform: 'linear'};
    }

    if (!def) return '';

    const {series, transform = 'linear'} = def;
    let name = columnDisplayNames[series] ?? series;

    if (transform === 'linear') {
        return name;
    } else if (transform === 'log') {
        return `log(${name})`;
    } else if (transform === 'negLog10') {
        return `-log(${name})`;
    } else {
        throw Error(`No support for transform ${transform}`)
    }
}

function validColumns(columnarData, dataColumns, columnTypes) {
    dataColumns ||= [];
    const numerics = new Set();
    const nonNumerics = new Set();

    for (const c of dataColumns) {
        const ct = columnTypes[c] || 'empty';
        if (ct === 'numeric' || ct === 'rating') {
            numerics.add(c);
        } else if (ct === 'info' || ct === 'notes') {
            nonNumerics.add(c);
        }
    }
    for (const nn of nonNumerics) numerics.delete(nn);

    const validColumns = [];
    for (const k of dataColumns) {
        if (numerics.has(k)) {
            validColumns.push({
                name: k
            });
        } else if (nonNumerics.has(k)) {
            validColumns.push({
                name: k,
                categorical: true
            });
        }
    }
    return validColumns;
}

class PlotErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = {error: undefined};
    }

    static getDerivedStateFromError(err) {
        return {error: err};
    }

    render() {
        const {error} = this.state;
        if (error) {
            return (
                <div>
                    Sorry, rendering of this widget has failed.

                    <pre>
                        { error.message || error.toString() }
                    </pre>

                    <Button onClick={() => this.setState({error: undefined})}>
                        Try again.
                    </Button>
                </div>
            );
        }
        return this.props.children;
    }
}

export class PlotCombo extends React.Component {
    constructor(props) {
        super(props);

        this.svgRef = this.svgRef.bind(this);
        this.export = this.export.bind(this);
    }

    svgRef(svg) {
        this.plotSVG = svg;
    }

    export(ev) {
        const xml = new XMLSerializer().serializeToString(this.plotSVG);
        saveAs(new Blob([xml], {type: 'img/svg+xml'}), 'gyde-plot.svg');
    }

    render() {
        const {controllerStyle, plotStyle, ...props} = this.props;

        return (
            <React.Fragment>
                <div style={controllerStyle}>
                    <PlotController {...props}
                                    export={this.export} />
                </div>
                <div style={plotStyle}>
                    <PlotErrorBoundary>
                        <PlotHolder {...props}
                                    svgRef={this.svgRef} />
                    </PlotErrorBoundary>
                </div>
            </React.Fragment>
        );
    }
}