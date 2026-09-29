import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {PredictionInputs, predictionMenuLabel, predictionName} from './TamarindPredictionLayout';
global.IS_REACT_ACT_ENVIRONMENT = true;
test('labels only hosted predictions and avoids duplicate provider suffixes', () => {
    expect(predictionMenuLabel('Chai-1', true)).toBe('Chai-1 (Tamarind Bio)');
    expect(predictionMenuLabel('Boltz-2 (Tamarind)', true)).toBe('Boltz-2 (Tamarind Bio)');
    expect(predictionMenuLabel('Chai-1', false)).toBe('Chai-1');
    expect(predictionName('chai-1')).toBe('Chai-1');
});
test('shows selected molecules without editable duplicate inputs', async () => {
    const el = document.createElement('div');
    const root = createRoot(el);
    await act(async () => root.render(<PredictionInputs infos={[
        {proteinSequences:['ACD'],ligands:['CCO'],dnas:['ACGT'],rnas:['ACGU']},
        {proteinSequences:['EFG']},
    ]}/>));
    for (const value of ['Prediction 1','Prediction 2','ACD','CCO','ACGT','ACGU','EFG']) expect(el.textContent).toContain(value);
    expect(el.querySelector('input,textarea')).toBeNull();
    await act(async () => root.unmount());
});
