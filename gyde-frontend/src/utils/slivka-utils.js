export async function uploadFile(service, file) {
    const fd = new FormData();
    fd.append('file', file);
    const resp = await fetch(`${service.apiPrefix}/files`, {method: 'POST', body: fd});
    if (!resp.ok) {
        throw Error(resp.statusText);
    }
    const result = await resp.json();
    return result.id;
}


export async function preUploadFiles(service, input) {
    const fixedInput = {...input};
    if (!service?.parameters) return fixedInput;
    for (const param of service.parameters) {
        if (param.type === 'file') {
            const pid = param.id;
            if (!fixedInput[pid]) continue;

            if (param.array && fixedInput[pid] instanceof Array) {
                const na = [];
                for (const x of fixedInput[pid]) {
                    if (x instanceof Blob) {
                        const fid = await uploadFile(service, x);
                        na.push(fid);
                    } else {
                        na.push(x);
                    }
                }
                fixedInput[pid] = na;
            } else if (fixedInput[pid] instanceof Blob) {
                const fid = await uploadFile(service, fixedInput[pid]);
                fixedInput[pid] = fid;
            }
        }
    }
    return fixedInput;
};