const voiceLocales:Record<string,string>={en:'en-IN',hi:'hi-IN',mr:'mr-IN'};
type OutputProvider='Gnani Timbre v3.0'|'Browser speech'|'No speech available'|'Stopped';
let currentAudio:HTMLAudioElement|null=null;
let currentObjectUrl:string|null=null;
let currentRequest:AbortController|null=null;

function browserSpeak(text:string,language:string):Promise<OutputProvider>{
 if(typeof window==='undefined'||!('speechSynthesis'in window)||typeof SpeechSynthesisUtterance==='undefined')return Promise.resolve('No speech available');
 window.speechSynthesis.cancel();
 return new Promise(resolve=>{const utterance=new SpeechSynthesisUtterance(text);utterance.lang=voiceLocales[language]??voiceLocales.en;utterance.rate=.92;utterance.onend=()=>resolve('Browser speech');utterance.onerror=()=>resolve('No speech available');window.speechSynthesis.speak(utterance)});
}

/** Uses the server-side Gnani proxy first; browser speech is an explicit fallback only. */
export async function speakText(text:string,language='en'):Promise<OutputProvider>{
 stopSpeaking();
 const controller=new AbortController();currentRequest=controller;
 try{
  const response=await fetch('/api/gnani/tts',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text,language}),signal:controller.signal});
  if(!response.ok)throw new Error('Timbre proxy returned an error');
  const blob=await response.blob();
  if(controller.signal.aborted)return 'Stopped';
  currentObjectUrl=URL.createObjectURL(blob);
  currentAudio=new Audio(currentObjectUrl);
  await new Promise<void>((resolve,reject)=>{if(!currentAudio)return reject(new Error('Audio element unavailable'));currentAudio.onended=()=>resolve();currentAudio.onerror=()=>reject(new Error('Timbre audio could not be played'));void currentAudio.play().catch(reject)});
  return 'Gnani Timbre v3.0';
 }catch(error){
  if(controller.signal.aborted)return 'Stopped';
  if(currentObjectUrl){URL.revokeObjectURL(currentObjectUrl);currentObjectUrl=null;currentAudio=null}
  return browserSpeak(text,language);
 }finally{if(currentRequest===controller)currentRequest=null}
}

export function stopSpeaking(){
 if(typeof window!=='undefined'&&'speechSynthesis'in window)window.speechSynthesis.cancel();
 currentRequest?.abort();currentRequest=null;
 if(currentAudio){currentAudio.pause();currentAudio.onended=null;currentAudio.onerror=null;currentAudio=null}
 if(currentObjectUrl){URL.revokeObjectURL(currentObjectUrl);currentObjectUrl=null}
}
