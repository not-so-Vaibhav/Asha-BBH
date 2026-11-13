import type { Language } from '../domain/types';
import type { SpeechProvider, TranscriptUpdate } from './SpeechProvider';
export class GnaniProvider implements SpeechProvider {
 readonly name='Gnani Prisma (not configured)';
 async capture(_demoTranscript:string,_language:Language,_onTranscript:TranscriptUpdate):Promise<void>{throw new Error('TODO(GNANI): provide Prisma STT endpoint, credentials, and streaming protocol.')}
 stop(){}
}
