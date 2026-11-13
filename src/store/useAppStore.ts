import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { FollowUp, Language, Referral, VisitRecord } from '../domain/types';

type Store = {
  language:Language; dark:boolean; visits:VisitRecord[]; referrals:Referral[]; followups:FollowUp[];
  setLanguage:(language:Language)=>void; toggleDark:()=>void;
  addReferral:(referral:Referral)=>void; saveVisit:(record:VisitRecord)=>void;
  markFollowUpDone:(id:string)=>void; linkReferral:(id:string,visitId:string)=>void;
  resetDemo:()=>void;
};
const emptyVisits:VisitRecord[]=[];
export const useAppStore=create<Store>()(persist((set,get)=>({
 language:'en',dark:false,visits:emptyVisits,referrals:[],followups:[],
 setLanguage:(language)=>set({language}),toggleDark:()=>set((s)=>({dark:!s.dark})),
 addReferral:(referral)=>{if(!get().referrals.some((r)=>r.id===referral.id))set((s)=>({referrals:[referral,...s.referrals]}))},
 saveVisit:(record)=>{const exists=get().visits.some((v)=>v.id===record.id);if(exists)return;const date=record.fields.nextVisitDate;const nextFollowUp:FollowUp|undefined=date&&date!=='Not set'?{id:'FU-'+record.id,beneficiaryId:record.beneficiaryId,beneficiaryName:record.beneficiaryName,date,status:'Upcoming',visitId:record.id}:undefined;set((s)=>({visits:[record,...s.visits],followups:nextFollowUp?[nextFollowUp,...s.followups]:s.followups}));if(record.referralId)get().linkReferral(record.referralId,record.id)},
 markFollowUpDone:(id)=>set((s)=>({followups:s.followups.map((f)=>f.id===id?{...f,status:'Done'}:f)})),
 linkReferral:(id,visitId)=>set((s)=>({referrals:s.referrals.map((r)=>r.id===id?{...r,visitId}:r)})),
 resetDemo:()=>set({visits:[],referrals:[],followups:[],language:'en',dark:false}),
}),{name:'asha-sakhi-demo',partialize:(state)=>({language:state.language,dark:state.dark,visits:state.visits,referrals:state.referrals,followups:state.followups})}));
