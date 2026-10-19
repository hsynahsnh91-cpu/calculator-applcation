import assert from 'node:assert/strict';
import katex from 'katex';
import { evaluateMathExpression, recognizeExact, SCIENTIFIC_CONSTANTS } from '../../src/core/engines/scientific/mathEngine';
import { nodesToMathjs, nodesToLatex, insertAtTarget, deleteAtTarget, BoxNode } from '../../src/features/scientific/naturalDisplayTree';
import { solveLinear, solveQuadratic, solveCubic, solveSystem2x2, solveSystem3x3 } from '../../src/core/engines/equations/equationSolver';
import { solveArithmeticSequence, solveGeometricSequence, solveRecurrenceType1 } from '../../src/core/engines/sequences/sequenceSolver';
import { computeDerivative, computeLimit, computeDefiniteIntegral, buildVariationTableLatex } from '../../src/core/engines/calculus/calculusEngine';
import { solveIntegral } from '../../src/core/engines/integration/integrationEngine';
import { solveMatrixOperations } from '../../src/core/engines/matrices/matricesEngine';
import { solveComplexNumber, algebraicSquareRoots } from '../../src/core/engines/complex/complexEngine';
import { combinations, permutations, factorial, solveBinomialDistribution, solveNormalDistribution, computeDescriptiveStats, solveUrnExperiment, randomVariableOfDraw } from '../../src/core/engines/probability/probabilityEngine';
import { dot, cross, planeFromThreePoints, relationLines, tetrahedronVolume } from '../../src/core/engines/geometry/geometryEngine';
import { localDB } from '../../src/app/storage/localDB';

const failures: string[] = [];
const passes: string[] = [];
const latexErrors: string[] = [];
function approx(a: number, b: number, eps = 1e-8) { assert(Math.abs(a-b) <= eps, `${a} != ${b}`); }
function check(name:string,fn:()=>void) {try {fn(); passes.push(name); console.log('PASS',name)} catch(e) { failures.push(`${name}: ${String(e)}`); console.log('FAIL', name, String(e))}}
function validateMath(x: unknown, path='root') {
  if (Array.isArray(x)) x.forEach((v,i)=>validateMath(v,`${path}[${i}]`));
  else if (x && typeof x ==='object') Object.entries(x).forEach(([k,v])=>validateMath(v,`${path}.${k}`));
  else if (typeof x === 'string' && /latex|exact|formula|mathLatex/i.test(path) && x.trim()) {
    try {katex.renderToString(x,{throwOnError:true,strict:false});} catch(e) {latexErrors.push(`${path}: ${x}: ${String(e)}`)}
  }
}
const ch = (s:string):BoxNode[] => s.split('').map((char,i)=>({type:'char',id:`c${i}`,char}));
for (const [mode,angle] of [['DEG','30'],['RAD',String(Math.PI/6)],['GRAD',String(100/3)]] as const) {
  check(`scientific sin ${mode}`,()=>{ const nodes:BoxNode[]=[{type:'function',id:'trig',name:'sin',arg:ch(angle)}]; const v=evaluateMathExpression(nodesToMathjs(nodes,mode),mode); approx(Number(v.result),.5); assert.equal(v.latexStr,'\\dfrac{1}{2}'); validateMath(v); });
}
check('undefined tan 90',()=>{assert.throws(()=>evaluateMathExpression(nodesToMathjs([{type:'function',id:'t',name:'tan',arg:ch('90')}],'DEG'),'DEG'),/غير معرّفة/)});
check('fraction evaluation',()=>approx(Number(evaluateMathExpression('1/2','DEG').result),.5));
check('exact surd recognition',()=>{assert.match(recognizeExact(Math.sqrt(3)/2)?.latex??'',/sqrt/); assert.match(recognizeExact((Math.sqrt(6)-Math.sqrt(2))/4)?.latex??'',/sqrt/)});
check('scientific constants',()=>assert.equal(SCIENTIFIC_CONSTANTS.length,16));
check('nested expression insertion/deletion',()=>{const root:BoxNode[]=[{type:'fraction',id:'f',num:ch('12'),den:ch('3')}]; const a=insertAtTarget(root,{nodeId:'f',slot:'den',index:1},ch('4'));assert.equal(nodesToMathjs(a.updatedNodes).trim(),'((12) / (34))');const b=deleteAtTarget(a.updatedNodes,a.newTarget);assert.match(nodesToMathjs(b.updatedNodes),/\(3\)/)});
check('linear',()=>{const v=solveLinear(2,-4); approx(Number(v.roots[0].decimal),2);validateMath(v)});
check('quadratic real',()=>{const v=solveQuadratic(1,-5,6); assert.deepEqual(v.roots.map(x=>Number(x.decimal)).sort(),[2,3]); approx(v.vertex!.x,2.5);validateMath(v)});
check('quadratic complex',()=>{const v=solveQuadratic(1,0,1);assert(v.roots.every(x=>x.isComplex));validateMath(v)});
check('cubic rational roots',()=>{const v=solveCubic(1,-6,11,-6);assert.deepEqual(v.roots.map(x=>Number(x.decimal)).sort(),[1,2,3]);validateMath(v)});
check('cubic Cardano',()=>{const v=solveCubic(1,0,1,1);validateMath(v); assert(v.roots.length>0);});
check('system 2x2',()=>{const v=solveSystem2x2(1,1,3,1,-1,1); assert.deepEqual(v.roots.map(x=>Number(x.decimal)),[2,1]);validateMath(v)});
check('system 3x3',()=>{const v=solveSystem3x3([[1,0,0],[0,1,0],[0,0,1]],[1,2,3]);assert.deepEqual(v.roots.map(x=>Number(x.decimal)),[1,2,3]);validateMath(v)});
check('arithmetic sequence',()=>{const v=solveArithmeticSequence({u1:3,r:2,startIndex:0,calculateSumN:4});approx(v.sumValue!,35);validateMath(v)});
check('geometric sequence',()=>{const v=solveGeometricSequence({u1:1,q:.5,startIndex:0,calculateSumN:3});approx(v.sumValue!,1.875);assert(v.limit.converges);validateMath(v)});
check('recurrence sequence',()=>{const v=solveRecurrenceType1({u0:0,a:.5,b:1,calculateSumN:4});approx(Number(v.limit.value),2);assert(v.auxiliarySequence);validateMath(v)});
check('derivative+tangent',()=>{const v=computeDerivative('x^3-3*x+2',1);approx(v.tangentLine!.slope,0);assert(v.criticalPoints!.length>=2);validateMath(v); validateMath({variationTableLatex:buildVariationTableLatex('x^3-3*x+2')});});
for(const [expr,target,want] of [['sin(x)/x',0,1],['(x^2-1)/(x-1)',1,2],['(1-cos(x))/x^2',0,.5],['(2*x^2+1)/(x^2-3)','infinity',2]] as const) {
 check(`limit ${expr}`,()=>{const v=computeLimit(expr,target);validateMath(v);console.log('limit-result',v.limitValue?.result);assert(v.limitValue?.kind==='finite'); assert(v.limitValue?.result.includes(String(want))|| (want===.5&&/frac/.test(v.limitValue!.result)));});
}
check('two-sided limit does not exist',()=>{const v=computeLimit('1/x',0);assert.equal(v.limitValue?.kind,'dne');validateMath(v)});
check('calculus definite integral',()=>{const v=computeDefiniteIntegral('x^2',0,1);approx(v.integralValue!.definiteValue!,1/3,1e-6);validateMath(v)});
for (const expr of ['x^2+3*x','sin(x)','2*x*cos(x^2)','x*exp(x)','exp(-x^2)','sin(x)/x','sin(x^2)']) {
 check(`integral ${expr}`,()=>{const v=solveIntegral({expression:expr,variable:'x',mode:'indefinite',method:'automatic'});assert(v.primitiveLatex||v.series);validateMath(v);});
}
check('definite integral exact',()=>{const v=solveIntegral({expression:'x^2',variable:'x',mode:'definite',method:'automatic',lower:0,upper:1});approx(v.decimalValue!,1/3);validateMath(v)});
check('matrix inverse and Gauss',()=>{const v=solveMatrixOperations([[1,2],[3,4]],[[1,0],[0,1]]);approx(v.detA!,-2);assert.deepEqual(v.inverseA,[[-2,1],[1.5,-.5]]);assert.equal(v.rankA,2);assert(v.gauss);validateMath(v)});
check('singular matrix',()=>{const v=solveMatrixOperations([[1,2],[2,4]]);assert.equal(v.rankA,1);assert(!v.inverseA);validateMath(v)});
check('complex number 3+4i',()=>{const v=solveComplexNumber(3,4,undefined,undefined,3,3);approx(v.modulus,5);assert.equal(v.roots?.length,3);v.roots!.forEach(r=>{approx(Math.hypot(r.re,r.im),Math.cbrt(5));});validateMath(v)});
check('algebraic complex square root',()=>{const v=algebraicSquareRoots(3,4);assert(v.ok);validateMath(v)});
check('combinatorics',()=>{assert.equal(combinations(5,2),10);assert.equal(permutations(5,2),20);assert.equal(factorial(5),120)});
check('binomial distribution',()=>{const v=solveBinomialDistribution(10,.5,5);validateMath(v); console.log('binomial',JSON.stringify(v).slice(0,300));});
check('normal distribution',()=>{const v=solveNormalDistribution(0,1,0,-1,1);validateMath(v);console.log('normal',JSON.stringify(v).slice(0,300));});
check('descriptive statistics',()=>{const v=computeDescriptiveStats([1,2,3,4,5]);assert.equal(v.mean,3);assert.equal(v.median,3);assert.equal(v.variancePop,2);validateMath(v)});
for(const mode of ['simultaneous','successive_without_rep','successive_with_rep'] as const) {
 check(`urn ${mode}`,()=>{const colors=[{name:'أبيض',count:3},{name:'أسود',count:2}]; const v=solveUrnExperiment(colors,2,mode);validateMath(v);console.log('urn',mode,JSON.stringify(v).slice(0,100)); const rv=randomVariableOfDraw(colors,2,mode,0);validateMath(rv);console.log('rv',JSON.stringify(rv).slice(0,200));});
}
check('geometry dot+cross',()=>{assert.equal(dot([1,0,0],[0,1,0]),0);assert.deepEqual(cross([1,0,0],[0,1,0]),[0,0,1]);validateMath(planeFromThreePoints([0,0,0],[1,0,0],[0,1,0]));validateMath(tetrahedronVolume([0,0,0],[1,0,0],[0,1,0],[0,0,1]));validateMath(relationLines({P:[0,0,0],u:[1,0,0]},{P:[0,1,1],u:[0,1,0]}));});

check('flat minimum x^4',()=>{const v=computeDerivative('x^4',0);assert.equal(v.criticalPoints?.find(p=>p.x===0)?.type,'min');validateMath(v)});
check('nonstationary inflection x^3+x',()=>{const v=computeDerivative('x^3+x',0);assert.equal(v.criticalPoints?.find(p=>p.x===0)?.type,'inflection');validateMath(v)});
check('critical points outside the old scan range',()=>{const v=computeDerivative('(x-100)^2',100);approx(v.criticalPoints![0].x,100);assert.equal(v.criticalPoints![0].type,'min');validateMath(v)});
check('derivative rule explanations for product and quotient',()=>{const v=computeDerivative('(x+1)*sin(x)/(x+2)',0);assert(v.steps.some(s=>s.title==='قاعدة اشتقاق الجداء'));assert(v.steps.some(s=>s.title==='قاعدة اشتقاق خارج القسمة'));validateMath(v)});
check('variable exponent derivative rule',()=>{const v=computeDerivative('x^x',1);assert(v.steps.some(s=>s.title==='قاعدة القوة ذات الأس المتغير'));validateMath(v)});
for(const expression of ['5','x','x^2','x^3','x^4','1/x','sqrt(x)'])check('variation table '+expression,()=>{const v=buildVariationTableLatex(expression);assert(v);assert(!v.includes('NaN'));assert(v.indexOf('-\\infty')<v.indexOf('+\\infty'));validateMath({variationTableLatex:v})});
check('unary minus in famous limits',()=>{const v=computeLimit('-sin(x)/x',0);assert.equal(v.limitValue?.result,'-1');validateMath(v)});
check('LHopital validates its form',()=>{assert.equal(computeLimit('(exp(x)-1)/x',0,true).limitValue?.result,'1');assert.throws(()=>computeLimit('x+1',0,true),/لوبيتال/)});
check('incompatible singular system 2x2',()=>{const v=solveSystem2x2(0,1,1,0,2,3);assert.match(v.roots[0].exactLatex,/emptyset/);validateMath(v)});
check('compatible singular system 3x3',()=>{const v=solveSystem3x3([[1,1,1],[2,2,2],[3,3,3]],[1,2,3]);assert.match(v.roots[0].exactLatex,/غير منته/);validateMath(v)});
check('incompatible singular system 3x3',()=>{const v=solveSystem3x3([[1,1,1],[2,2,2],[3,3,3]],[1,2,4]);assert.match(v.roots[0].exactLatex,/emptyset/);validateMath(v)});
check('alternating divergent recurrence is unbounded on both sides',()=>{const v=solveRecurrenceType1({u0:1,a:-2,b:0,calculateSumN:5});assert.equal(v.boundedness?.isBoundedBelow,false);assert.equal(v.boundedness?.isBoundedAbove,false);validateMath(v)});
check('zero geometric sequence avoids 0 times Infinity',()=>{const v=solveGeometricSequence({u1:0,q:1e100,calculateSumN:100});assert.equal(v.sumValue,0);validateMath(v)});
check('invalid sequence ranks are rejected',()=>{assert.throws(()=>solveArithmeticSequence({u1:1,r:1,startIndex:3,calculateSumN:2}));assert.throws(()=>solveArithmeticSequence({u1:1,r:1,startIndex:1.2}));assert.throws(()=>solveGeometricSequence({u1:1,q:10,calculateSumN:1000}))});
check('complex inverse sign and principal angle',()=>{const v=solveComplexNumber(-3,-4);assert(v.inverseLatex?.includes('+'));assert(v.argumentDeg<0);approx(v.argumentDeg,v.argumentRad*180/Math.PI);validateMath(v)});
check('complex power zero and first root',()=>{const v=solveComplexNumber(3,4,undefined,undefined,0,1);assert.equal(v.roots.length,1);approx(v.roots[0].re,3);approx(v.roots[0].im,4);assert(v.powerResults.some(p=>p.n===0));validateMath(v)});
check('invalid complex inputs and excessive roots rejected',()=>{assert.throws(()=>solveComplexNumber(0,0));assert.throws(()=>solveComplexNumber(NaN,1));assert.throws(()=>solveComplexNumber(1,1,undefined,undefined,-1,2));assert.throws(()=>solveComplexNumber(1,1,undefined,undefined,2,101))});
check('replacement random variable can exceed the colour stock',()=>{const c=[{name:'أبيض',count:1},{name:'أسود',count:1}];const rv=randomVariableOfDraw(c,3,'successive_with_rep',0);assert.equal(rv.values[rv.values.length-1]?.k,3);approx(rv.values.reduce((sum,p)=>sum+p.pVal,0),1);validateMath(rv)});
check('urn input counts are copied',()=>{const c=[{name:'أبيض',count:3},{name:'أسود',count:2}];const v=solveUrnExperiment(c,2,'simultaneous');c[0].count=99;assert.equal(v.colors[0].count,3)});
check('urn enumeration resource cap',()=>{const c=Array.from({length:20},(_,i)=>({name:String(i),count:1}));assert.throws(()=>solveUrnExperiment(c,10,'simultaneous'),/كبير جداً/)});
check('large combinations remain exact while representable',()=>{assert.equal(combinations(56,12),558383307300);assert.throws(()=>combinations(1000000000,500000000),/المجال/)});
check('binomial boundary distributions',()=>{for(const p of [0,1]){const v=solveBinomialDistribution(100,p,100*p);assert.equal(v.pk?.pVal,1);approx(v.table.reduce((sum,row)=>sum+row.pmf,0),1);validateMath(v)}});
check('invalid probability parameters',()=>{assert.throws(()=>solveBinomialDistribution(4,1.1));assert.throws(()=>solveBinomialDistribution(4,.5,1.5));assert.throws(()=>solveNormalDistribution(0,1,0,2,-2));assert.throws(()=>computeDescriptiveStats([1,Infinity]))});
check('normal curve for tiny sigma keeps distinct x coordinates',()=>{const v=solveNormalDistribution(0,1e-8);assert.equal(new Set(v.curvePoints.map(p=>p.x)).size,101);validateMath(v)});
check('singleton statistics and constant histograms',()=>{const a=computeDescriptiveStats([7]);assert.equal(a.median,7);assert.equal(a.q1,7);assert.equal(a.q3,7);validateMath(a);validateMath(computeDescriptiveStats([7,7,7]))});
for(const [expression,lower,upper] of [['1/x',-1,1],['1/(x-0.1)',-1,1],['1/x^2',0,1],['sqrt(x)',-1,1],['tan(x)',0,2]] as const)check('integral domain rejects '+expression,()=>{assert.throws(()=>solveIntegral({expression,mode:'definite',lower,upper}))});
for(const [expression,expected] of [['1/sqrt(x)',2],['log(x)',-1]] as const)check('convergent improper integral '+expression,()=>{const v=solveIntegral({expression,mode:'definite',lower:0,upper:1});approx(v.decimalValue!,expected);assert(v.warning?.includes('غير عادي متقارب'));validateMath(v)});
check('removable sinc singularity integrates correctly',()=>{const v=solveIntegral({expression:'sin(x)/x',mode:'definite',lower:-1,upper:1});approx(v.decimalValue!,1.892166140734366,1e-8);validateMath(v)});
check('parenthesized rational denominator stays intact',()=>{const v=solveIntegral({expression:'1/((x+1)*(x+2))',mode:'definite',lower:0,upper:1});approx(v.decimalValue!,Math.log(4/3),1e-8);validateMath(v)});
check('reversed definite bounds',()=>{const v=solveIntegral({expression:'x^2',mode:'definite',lower:1,upper:0});approx(v.decimalValue!,-1/3);validateMath(v)});
check('non-x integration variable',()=>{const v=solveIntegral({expression:'t^2',variable:'t',mode:'definite',lower:0,upper:3});approx(v.decimalValue!,9);validateMath(v)});
const storage=new Map<string,string>(); Object.defineProperty(globalThis,'localStorage',{value:{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value),removeItem:(key:string)=>storage.delete(key)}, configurable:true});
check('history cap and ordering',()=>{for(let i=0;i<160;i++)localDB.saveHistoryEntry({mode:'scientific',title:String(i),inputLatex:String(i),resultLatex:String(i)});assert.equal(localDB.getHistory().length,150);assert.equal(localDB.getHistory()[0].title,'159');});
check('history favorite and delete',()=>{const id=localDB.getHistory()[0].id;assert(localDB.toggleFavorite(id));assert(localDB.getHistory()[0].favorite);localDB.deleteHistoryEntry(id);assert(!localDB.getHistory().find(x=>x.id===id));});
check('history export/import',()=>{const json=localDB.exportDataJSON();localDB.clearHistory();assert.equal(localDB.getHistory().length,0);assert(localDB.importDataJSON(json));assert.equal(localDB.getHistory().length,149)});
check('history import must cap at 150',()=>{const list=Array.from({length:180},(_,i)=>({...localDB.getHistory()[0],id:'import_'+i,timestamp:i}));assert(localDB.importDataJSON(JSON.stringify({history:list})));assert.equal(localDB.getHistory().length,150)});
check('settings default merge',()=>{storage.set('pro_calc_settings','{"soundEnabled":false}');assert.equal(localDB.getSettings().angleMode,'DEG');});
console.log(JSON.stringify({passes:passes.length, failures, latexErrors},null,2));
process.exitCode=failures.length||latexErrors.length?1:0;
