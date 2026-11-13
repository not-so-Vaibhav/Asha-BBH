import type { Language } from '../domain/types';
import type { SpeechProvider, TranscriptUpdate } from './SpeechProvider';
type RecognitionResult={results:ArrayLike<ArrayLike<{transcript:string}>>};
type Recognition={lang:string;continuous:boolean;interimResults:boolean;onresult:(event:RecognitionResult)=>void;onend:()=>void;onerror:()=>void;start:()=>void;stop:()=>void};
type RecognitionWindow=Window&{webkitSpeechRecognition?:new()=>Recognition;SpeechRecognition?:new()=>Recognition};
const locale:Record<Language,string>={en:'en-IN',hi:'hi-IN',mr:'mr-IN'};
export class BrowserSpeechProvider implements SpeechProvider {
 readonly name='Browser speech';private active:Recognition|null=null;
 stop(){this.active?.stop();this.active=null}
 async capture(_demoTranscript:string,language:Language,onTranscript:TranscriptUpdate){const w=window as RecognitionWindow;const Constructor=w.SpeechRecognition??w.webkitSpeechRecognition;if(!Constructor)throw new Error('Browser speech recognition is not available. Choose Simulated or type the visit.');await new Promise<void>((resolve,reject)=>{const recognition=new Constructor();this.active=recognition;recognition.lang=locale[language];recognition.continuous=true;recognition.interimResults=true;recognition.onresult=event=>{let partial='';for(let i=0;i<event.results.length;i++)partial+=event.results[i][0].transcript+' ';onTranscript(partial.trim())};recognition.onend=()=>{this.active=null;resolve()};recognition.onerror=()=>{this.active=null;reject(new Error('Microphone speech could not be captured.'))};recognition.start()})}
}
