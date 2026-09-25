// One source of truth for the rendered pitch and collision surfaces.
export const FIELD = { halfWidth: 48, halfLength: 75, goalHalfWidth: 9, goalHeight: 8, goalDepth: 6, ballRadius: 1.65 };
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
export function rampHeight(x,z) {
  const side = Math.max(0,Math.abs(x)-(FIELD.halfWidth-5));
  const end = Math.max(0,Math.min(FIELD.halfLength,Math.abs(z))-(FIELD.halfLength-5));
  const t = clamp((Math.abs(x)-9)/5,0,1);
  // Smoothly open the bank into the goal, without an invisible step at x=11.
  const curve=d=>5-Math.sqrt(Math.max(0,25-Math.min(5,d)**2));
  const endHeight = curve(end)*t*t*(3-2*t);
  return Math.max(curve(side),endHeight);
}
export function surfaceAt(x,z) {
  const e=.02,gx=(rampHeight(x+e,z)-rampHeight(x-e,z))/(2*e),gz=(rampHeight(x,z+e)-rampHeight(x,z-e))/(2*e);
  const inv=1/Math.hypot(gx,1,gz);
  return {height:rampHeight(x,z),gx,gz,nx:-gx*inv,ny:inv,nz:-gz*inv};
}
const solid=(kind,x,y,z,w,h,d)=>({kind,x,y,z,hx:w/2,hy:h/2,hz:d/2});
export const ARENA_SOLIDS=[];
for(const s of [-1,1]) {
  ARENA_SOLIDS.push(solid('side',s*(FIELD.halfWidth+.3),12,0,.6,24,FIELD.halfLength*2+1));
  for(const x of [-(FIELD.halfWidth+9)/2,(FIELD.halfWidth+9)/2]) ARENA_SOLIDS.push(solid('end',x,12,s*FIELD.halfLength,FIELD.halfWidth-9,24,.9));
  for(const x of [-9,9]) ARENA_SOLIDS.push(solid('post',x,4,s*FIELD.halfLength,.65,8.5,.7));
  ARENA_SOLIDS.push(solid('bar',0,8,s*FIELD.halfLength,18.6,.65,.7));
  ARENA_SOLIDS.push(solid('header',0,16.2,s*FIELD.halfLength,18,15.7,.3));
  for(const x of [-9,9]) ARENA_SOLIDS.push(solid('goal-side',x,4,s*(FIELD.halfLength+3),.12,8,6));
  ARENA_SOLIDS.push(solid('goal-back',0,4,s*(FIELD.halfLength+6),18,8,.12));
  ARENA_SOLIDS.push(solid('goal-roof',0,8,s*(FIELD.halfLength+3),18,.12,6));
}
