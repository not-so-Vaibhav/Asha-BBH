import{describe,it,expect}from'vitest';import{detectDanger,scanDangerSigns}from'./rules';
describe('danger rule engine',()=>{
 it('matches pregnancy bleeding in code mix and Marathi',()=>{expect(detectDanger('Pregnant woman la bleeding hot aahe.','Pregnant')?.rule.id).toBe('PREG-01');expect(detectDanger('गर्भवतीला रक्तस्राव होत आहे','Pregnant','mr')?.rule.id).toBe('PREG-01')});
 it('matches pregnancy high fever',()=>expect(detectDanger('high fever','Pregnant')?.rule.id).toBe('PREG-02'));
 it.each(['no bleeding','bleeding nahi'])('suppresses clear negation: %s',text=>expect(detectDanger(text,'Pregnant')).toBeNull());
 it('alerts on ambiguous bleeding with review flag',()=>expect(detectDanger('maybe bleeding','Pregnant')?.needsReview).toBe(true));
 it('does not cross-apply rules to children',()=>expect(detectDanger('bleeding and high fever','Child')).toBeNull());
 it('matches newborn high fever and code-mixed not feeding only for newborns',()=>{expect(scanDangerSigns('Baby has high fever and doodh pit nahi','Newborn').map(x=>x.rule.id)).toEqual(['NB-01','NB-03']);expect(scanDangerSigns('high fever and doodh pit nahi','Child')).toEqual([])});
 it.each(['cold to touch','not feeding','fast breathing','weak cry','limp','convulsions','yellow palms and soles'])('recognizes newborn rule phrase %s',text=>expect(detectDanger(text,'Newborn')).not.toBeNull());
 it('waits for a trailing negation while speech is streaming',()=>{expect(detectDanger('bleeding','Pregnant','en',false)).toBeNull();expect(detectDanger('bleeding nahi','Pregnant','en',false)).toBeNull()});
});
