import{describe,it,expect}from'vitest';import{extract}from'./extraction';import{parseVisitDate}from'./dateParser';import{correctField}from'./correction';import type{VisitFields}from'./types';
const today='2026-11-13';const base:VisitFields={beneficiaryId:'BEN-1001',visitType:'ANC',weight:'55 kg',vaccinationsDue:'None reported',nextVisitDate:'2026-11-20'};
describe('visit extraction and dates',()=>{
 it('extracts all five structured fields from the demo sentence',()=>expect(extract('Aaj mi Sunita cha ANC follow-up visit ghetla. Weight 55 kilo aahe. Pudhil visit 20 November la theva.','BEN-1001',today)).toEqual({beneficiaryId:'BEN-1001',visitType:'ANC',weight:'55 kg',vaccinationsDue:'None reported',nextVisitDate:'2026-11-20'}));
 it('converts Devanagari numerals and vaccination names',()=>expect(extract('वजन ५६ किलो, vaccinations due OPV','BEN-1002',today)).toMatchObject({weight:'56 kg',vaccinationsDue:'OPV'}));
 it('parses Hindi relative dates',()=>expect(parseVisitDate('कल',today)).toBe('2026-11-14'));
 it('parses Marathi relative dates',()=>expect(parseVisitDate('परवा',today)).toBe('2026-11-15'));
 it('parses next Monday against injected today',()=>expect(parseVisitDate('next Monday',today)).toBe('2026-11-16'));
});
describe('field-specific correction history',()=>{
 it('changes only weight and stores old/new/time',()=>{const r=correctField('No, weight is 56 kilo',base,new Date('2026-11-13T12:00:00Z'));expect(r?.fields).toEqual({...base,weight:'56 kg'});expect(r?.correction).toMatchObject({field:'weight',oldValue:'55 kg',newValue:'56 kg',timestamp:'2026-11-13T12:00:00.000Z'})});
 it('corrects the next visit only',()=>expect(correctField('next visit 22 November',base)?.fields).toMatchObject({...base,nextVisitDate:'2026-11-22'}));

 it.each([
  ['vaccinations due: OPV and DPT', 'vaccinationsDue', 'OPV and DPT'],
  ['visit type is PNC', 'visitType', 'PNC'],
  ['beneficiary ID is BEN-1002', 'beneficiaryId', 'BEN-1002'],
 ] as const)('corrects only %s', (text, field, value) => {
  const result=correctField(text,base);
  expect(result?.correction.field).toBe(field);
  expect(result?.correction.newValue).toBe(value);
  expect(result?.fields).toEqual({...base,[field]:value});
 });

});
