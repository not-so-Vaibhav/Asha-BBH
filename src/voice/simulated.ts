import type { Language } from '../domain/types';
import type { SpeechProvider, TranscriptUpdate } from './SpeechProvider';

export class SimulatedProvider implements SpeechProvider {
  readonly name = 'Simulated';
  private stopped = false;

  stop() {
    this.stopped = true;
  }

  async capture(text: string, _language: Language, onTranscript: TranscriptUpdate) {
    this.stopped = false;
    let partial = '';
    for (const word of text.split(/\s+/)) {
      if (this.stopped) {
        if (partial !== text) onTranscript(text);
        break;
      }
      partial += (partial ? ' ' : '') + word;
      onTranscript(partial);
      await new Promise((resolve) => setTimeout(resolve, 75));
    }
  }
}
