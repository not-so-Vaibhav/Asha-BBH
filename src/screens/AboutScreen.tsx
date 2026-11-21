import { ArrowLeft, Info, ShieldAlert } from 'lucide-react';
import { extraCopy } from '../data/i18n';
import type { Language } from '../domain/types';

type Props = {
  language: Language;
  onBack: () => void;
};

export default function AboutScreen({ language, onBack }: Props) {
  const x = extraCopy[language];

  return (
    <div className="about-screen">
      <div className="page-title">
        <button type="button" className="icon" aria-label={x.back} onClick={onBack}>
          <ArrowLeft aria-hidden="true" />
        </button>
        <h1>{x.aboutTitle}</h1>
      </div>
      <p className="sub">{x.aboutIntro}</p>

      <article className="about-card">
        <h2>
          <Info size={16} aria-hidden="true" />
          {x.aboutSyntheticHeading}
        </h2>
        <p>{x.aboutSyntheticBody}</p>
      </article>

      <article className="about-card">
        <h2>
          <Info size={16} aria-hidden="true" />
          {x.aboutVoiceHeading}
        </h2>
        <p>{x.aboutVoiceBody}</p>
      </article>

      <article className="about-card">
        <h2>
          <Info size={16} aria-hidden="true" />
          {x.aboutMapHeading}
        </h2>
        <p>{x.aboutMapBody}</p>
      </article>

      <article className="about-card about-caution">
        <h2>
          <ShieldAlert size={16} aria-hidden="true" />
          {x.aboutMedicalHeading}
        </h2>
        <p>{x.aboutMedicalBody}</p>
      </article>
    </div>
  );
}
