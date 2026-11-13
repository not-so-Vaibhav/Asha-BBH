import {describe,it,expect} from 'vitest';
import {copy,extraCopy} from './i18n';
import type {Language} from '../domain/types';
const languages:Language[]=['en','hi','mr'];
describe('language dictionaries',()=>{
 it('provide the same keys for all supported languages',()=>{
  expect(Object.keys(copy.hi).sort()).toEqual(Object.keys(copy.en).sort());
  expect(Object.keys(copy.mr).sort()).toEqual(Object.keys(copy.en).sort());
  expect(Object.keys(extraCopy.hi).sort()).toEqual(Object.keys(extraCopy.en).sort());
  expect(Object.keys(extraCopy.mr).sort()).toEqual(Object.keys(extraCopy.en).sort());
 });
 it('localizes the visit steps and voice correction affordance',()=>{
  for(const lang of languages){expect(extraCopy[lang].stepSpeak).toBeTruthy();expect(extraCopy[lang].stepCheck).toBeTruthy();expect(extraCopy[lang].voiceCorrection).toBeTruthy();expect(extraCopy[lang].correctionHint).toBeTruthy()}
 });
});
