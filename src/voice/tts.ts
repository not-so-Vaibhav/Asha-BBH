const voiceLocales:Record<string,string>={en:'en-IN',hi:'hi-IN',mr:'mr-IN'};
/** Browser speech is a prototype fallback; it is not Gnani Timbre. */
export function speakText(text:string,language='en'):Promise<boolean>{
 if(typeof window==='undefined'||!('speechSynthesis'in window)||typeof SpeechSynthesisUtterance==='undefined')return Promise.resolve(false);
 window.speechSynthesis.cancel();
 return new Promise(resolve=>{const utterance=new SpeechSynthesisUtterance(text);utterance.lang=voiceLocales[language]??voiceLocales.en;utterance.rate=.92;utterance.onend=()=>resolve(true);utterance.onerror=()=>resolve(false);window.speechSynthesis.speak(utterance)});
}
export function stopSpeaking(){if(typeof window!=='undefined'&&'speechSynthesis'in window)window.speechSynthesis.cancel()}

// TODO(GNANI): wire Timbre TTS only after receiving the official endpoint,
// credentials, supported language/voice IDs, and streaming protocol.
export interface TimbreProvider { speak(text:string,language:'en'|'hi'|'mr'):Promise<void> }
export class UnconfiguredTimbreProvider implements TimbreProvider {
 async speak():Promise<void>{throw new Error('TODO(GNANI): provide Timbre TTS endpoint, credentials, language/voice IDs, and streaming protocol.')}
}
