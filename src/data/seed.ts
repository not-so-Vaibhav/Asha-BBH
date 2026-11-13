import type { Beneficiary } from '../domain/types';

export const beneficiaries: Beneficiary[] = [
  { id:'BEN-1001', name:'Sunita Patil', kind:'Pregnant', age:'28 yrs', due:'ANC follow-up', villageId:'village-pipal' },
  { id:'BEN-1002', name:'Baby of Anita', kind:'Newborn', age:'Day 7', due:'Newborn check', villageId:'village-pipal' },
  { id:'BEN-1003', name:'Rekha Jadhav', kind:'Child', age:'9 months', due:'Growth check', villageId:'village-lotus' },
  { id:'BEN-1004', name:'Meena Pawar', kind:'Pregnant', age:'24 yrs', due:'ANC visit', villageId:'village-river' },
  { id:'BEN-1005', name:'Aarav Kulkarni', kind:'Child', age:'2 yrs', due:'Immunisation', villageId:'village-lotus' },
];
