import type { Language } from '../domain/types';
export type TranscriptUpdate=(partial:string)=>void;
export interface SpeechProvider { readonly name:string; capture(demoTranscript:string,language:Language,onTranscript:TranscriptUpdate):Promise<void>; stop():void }
