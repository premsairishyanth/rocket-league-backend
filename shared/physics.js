import { carFrame } from './car-frame.js';
// Fixed-step arcade simulation, independent of rendering and frame rate.
import { FIELD, rampHeight, surfaceAt, ARENA_SOLIDS } from './arena.js';
export { FIELD, rampHeight } from './arena.js';
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));
export function makeCar(z = FIELD.halfLength*.52, yaw = 0) {
  return { x: 0, y: .65, z, vx: 0, vy: 0, vz: 0, yaw, boost: 100, grounded: true, jumps: 0, flip: 0, steer: 0, boosting: false, hitCooldown: 0, pitch: 0, roll: 0, wall: null, wallCooldown: 0, pitchRate: 0, yawRate: 0, rollRate: 0 };
}
export function makeBall() { return { x: 0, y: FIELD.ballRadius, z: 0, vx: 0, vy: 0, vz: 0, hitFlash: 0, lastTouch: null }; }
export function jumpCar(car) {
  if(car.wall){
    const frame=carFrame(car);car.vx+=frame.up[0]*11;car.vy+=frame.up[1]*11+2;car.vz+=frame.up[2]*11;
    car.pitch=Math.asin(clamp(frame.forward[1],-.98,.98));
    car.yaw=Math.atan2(frame.forward[0]+frame.up[0]*.2,-frame.forward[2]-frame.up[2]*.2);
    car.pitchRate=0;car.yawRate=0;car.rollRate=0;
    car.wall=null;car.wallCooldown=.4;car.grounded=false;car.jumps=1;return true;
  }
  if (car.grounded) { car.pitch=clamp(car.pitch,-.12,.18);car.pitchRate=0;car.yawRate=0;car.rollRate=0;car.vy = 10.8; car.grounded = false; car.jumps = 1; return true; }
  if (car.jumps === 1) {
    const f=carFrame(car).forward;car.vy = Math.max(car.vy, 5)+f[1]*8; car.vx += f[0]*12; car.vz += f[2]*12;
    car.jumps = 2; car.flip = .52; return true;
  }
  return false;
}
// Digital steering ramps in gently; release and counter-steer respond faster.
function steeringResponse(car,target,speed,drift,dt){
  const current=car.steer||0;
  const rate=target===0?26:current*target<0?22:12;
  car.steer=current+(target-current)*(1-Math.exp(-rate*dt));
  if(target===0&&Math.abs(car.steer)<.002)car.steer=0;
  const fast=clamp((speed-10)/33,0,1);
  const power=drift?2.1-fast*.45:1.8-fast*.75;
  return car.steer*power*clamp(speed/5,0,1);
}
export function stepCar(car, input, dt) {
  const throttle = clamp(input.throttle || 0, -1, 1), steer = clamp(input.steer || 0, -1, 1);
  car.wallCooldown=Math.max(0,(car.wallCooldown||0)-dt);
  if(car.wall){stepWallCar(car,input,dt);return;}
  if(!car.grounded){stepAerialCar(car,input,dt);return;}
  const forwardX = Math.sin(car.yaw), forwardZ = -Math.cos(car.yaw);
  let forwardSpeed = car.vx * forwardX + car.vz * forwardZ;
  const speed = Math.hypot(car.vx, car.vz);
  const direction = forwardSpeed < -1 ? -1 : 1;
  car.yaw += steeringResponse(car,steer,speed,input.drift,dt)*direction*dt;
  car.boosting = !!input.boost && car.boost > 0;
  const acceleration = throttle * (car.grounded ? 24 : 7) + (car.boosting ? 38 : 0);
  car.vx += Math.sin(car.yaw) * acceleration * dt;
  car.vz -= Math.cos(car.yaw) * acceleration * dt;
  car.boost = clamp(car.boost + (car.boosting ? -26 : 8) * dt, 0, 100);
  // Remove lateral slip gradually; drifting deliberately preserves momentum.
  const lateralX = Math.cos(car.yaw), lateralZ = Math.sin(car.yaw);
  const lateralSpeed = car.vx * lateralX + car.vz * lateralZ;
  const grip = input.drift ? 3.8 : steer===0 ? 18 : 14;
  const gripFactor = 1 - Math.exp(-grip * dt);
  car.vx -= lateralX * lateralSpeed * gripFactor;
  car.vz -= lateralZ * lateralSpeed * gripFactor;
  const resistance = Math.exp(-(throttle || car.boosting ? .25 : 1.3) * dt);
  car.vx *= resistance; car.vz *= resistance;
  const maxSpeed = car.boosting ? 43 : 28;
  const currentSpeed = Math.hypot(car.vx, car.vz);
  if (currentSpeed > maxSpeed) { const factor = Math.max(maxSpeed / currentSpeed, Math.exp(-2 * dt)); car.vx *= factor; car.vz *= factor; }
  if (car.grounded) {
    const surface=surfaceAt(car.x,car.z);
    // Gravity brings a stopped car back down a bank instead of hanging on it.
    car.vx += surface.nx * surface.ny * 18 * dt;
    car.vz += surface.nz * surface.ny * 18 * dt;
  }
  car.vy -= 22 * dt;
  car.x += car.vx * dt; car.y += car.vy * dt; car.z += car.vz * dt;
  attachWall(car);
  if(!car.wall)resolveCarArena(car);
  car.flip = Math.max(0, car.flip - dt); car.hitCooldown = Math.max(0, car.hitCooldown - dt);
}
// Match the four tyre contact points to the same surface rendered by the arena.
export function carSupport(car) {
  const c=Math.cos(car.yaw),s=Math.sin(car.yaw);
  const height=(x,z)=>rampHeight(car.x+c*x-s*z,car.z+s*x+c*z);
  const fl=height(-1.08,-1.15),fr=height(1.08,-1.15),bl=height(-1.08,1.15),br=height(1.08,1.15);
  const forward=((fl+fr)-(bl+br))/4.6, lateral=((fr+br)-(fl+bl))/4.32;
  return {height:(fl+fr+bl+br)/4+.65,pitch:Math.atan(forward),roll:Math.atan(lateral)};
}
export function resolveCarArena(car) {
  if(car.wall)return;
  const frame=carFrame(car);
  const extent=i=>Math.abs(frame.right[i])*1.28+Math.abs(frame.up[i])*.85+Math.abs(frame.forward[i])*2.02;
  const hx=extent(0),hz=extent(2),hy=extent(1);
  // The yaw-dependent footprint keeps the bumper and wheels inside, not just the centre.
  for(let iteration=0;iteration<3;iteration++) for(const wall of ARENA_SOLIDS) {
    const dx=car.x-wall.x,dy=car.y+.4-wall.y,dz=car.z-wall.z;
    const ox=hx+wall.hx-Math.abs(dx),oy=hy+wall.hy-Math.abs(dy),oz=hz+wall.hz-Math.abs(dz);
    if(ox<=0||oy<=0||oz<=0)continue;
    let axis='x',depth=ox,sign=Math.sign(dx)||1;
    if(oz<depth){axis='z';depth=oz;sign=Math.sign(dz)||1;}
    if(oy<depth){axis='y';depth=oy;sign=Math.sign(dy)||1;}
    car[axis]+=sign*(depth+.001);
    const velocity='v'+axis;
    if(car[velocity]*sign<0)car[velocity]*=-.12;
  }
  if(car.y>22.5){car.y=22.5;car.vy=Math.min(0,car.vy);}
  const support=carSupport(car);
  // Stick to the road when driving downhill, but never cancel an intentional jump.
  if(car.y<=support.height || (car.grounded&&car.vy<=0&&car.y-support.height<.65)) {
    car.y=support.height;car.vy=0;car.grounded=true;car.jumps=0;
    car.pitch=support.pitch;car.roll=support.roll;car.pitchRate=0;car.yawRate=0;car.rollRate=0;
  }else car.grounded=false;
}
// Sphere against the oriented chassis, including a ball already inside the box.
export function carBallContact(car, ball) {
  const frame=carFrame(car),d=[ball.x-car.x-frame.up[0]*.5,ball.y-car.y-frame.up[1]*.5,ball.z-car.z-frame.up[2]*.5];
  const dot=a=>a.reduce((v,n,i)=>v+n*d[i],0);
  const local=[dot(frame.right),dot(frame.up),-dot(frame.forward)];
  const low=[-1.24,-.62,-1.98],high=[1.24,.72,1.98];
  const normal=local.map((v,i)=>v-clamp(v,low[i],high[i]));
  const distance=Math.hypot(...normal);
  if(distance>=FIELD.ballRadius)return null;
  let depth=FIELD.ballRadius-distance;
  if(distance<.00001){
    let nearest=Infinity,axis=0,sign=1;
    for(let i=0;i<3;i++)for(const side of [-1,1]){
      const gap=side<0?local[i]-low[i]:high[i]-local[i];
      if(gap<nearest){nearest=gap;axis=i;sign=side;}
    }
    normal.fill(0);normal[axis]=sign;depth=FIELD.ballRadius+nearest;
  }else for(let i=0;i<3;i++)normal[i]/=distance;
  const n=frame.right.map((v,i)=>v*normal[0]+frame.up[i]*normal[1]-frame.forward[i]*normal[2]);
  return {normal:n,depth:depth+.001};
}
export function separateCarBall(car,ball){
  const contact=carBallContact(car,ball);if(!contact)return false;
  ball.x+=contact.normal[0]*contact.depth;ball.y+=contact.normal[1]*contact.depth;ball.z+=contact.normal[2]*contact.depth;
  return true;
}
export function collideCarBall(car, ball) {
  const contact=carBallContact(car,ball);if(!contact)return 0;
  const [worldX,worldY,worldZ]=contact.normal;
  ball.x+=worldX*contact.depth;ball.y+=worldY*contact.depth;ball.z+=worldZ*contact.depth;
  const closing=(car.vx-ball.vx)*worldX+(car.vy-ball.vy)*worldY+(car.vz-ball.vz)*worldZ;
  if(closing<=.05)return 0;
  const groundedHit=car.grounded&&!car.wall&&ball.y<car.y+2&&Math.abs(worldY)<.3;
  const restitution=car.boosting||car.flip>0?.2:.06;
  const impulse=closing*(1+restitution);
  ball.vx+=worldX*impulse;ball.vy+=worldY*impulse;ball.vz+=worldZ*impulse;
  if(groundedHit) {
    // Low taps roll; fast shots get a small predictable hop rather than a huge lob.
    const lift=car.boosting?clamp((closing-12)*.10,0,3):clamp((closing-16)*.07,0,1.2);
    ball.vy=Math.min(3.2,Math.max(ball.vy,lift));
  }
  const speed=Math.hypot(ball.vx,ball.vy,ball.vz);
  if(speed>46){const f=46/speed;ball.vx*=f;ball.vy*=f;ball.vz*=f;}
  car.vx-=worldX*impulse*.055;car.vz-=worldZ*impulse*.055;
  ball.hitFlash=1;ball.lastTouch=car.team||'home';
  const feedback=car.hitCooldown<=0?impulse:0;car.hitCooldown=.1;
  return feedback;
}
export function collideCars(a, b) {
  const dx=b.x-a.x, dz=b.z-a.z, dist=Math.hypot(dx,dz);
  if (dist>=2.6 || Math.abs(a.y-b.y)>1.6) return;
  const nx=dist>.001?dx/dist:1, nz=dist>.001?dz/dist:0, overlap=(2.6-dist)/2;
  a.x-=nx*overlap; a.z-=nz*overlap; b.x+=nx*overlap; b.z+=nz*overlap;
  const closing=(a.vx-b.vx)*nx+(a.vz-b.vz)*nz;
  if(closing>0){const impulse=closing*.7;a.vx-=nx*impulse;a.vz-=nz*impulse;b.vx+=nx*impulse;b.vz+=nz*impulse;}
}
export function resolveBallArena(ball) {
  const r=FIELD.ballRadius;
  // Recover invalid/outside placements as well as normal contacts from inside.
  if(Math.abs(ball.x)>FIELD.halfWidth-r){const sign=Math.sign(ball.x);ball.x=sign*(FIELD.halfWidth-r);reflect(ball,-sign,0,0,.78,.5);}
  const outsideMouth=Math.abs(ball.x)>9-.325-r||ball.y>8-.325-r;
  if(outsideMouth&&Math.abs(ball.z)>FIELD.halfLength+.45){const sign=Math.sign(ball.z);ball.z=sign*(FIELD.halfLength-.45-r);reflect(ball,0,0,-sign,.78,.5);}
  for(let iteration=0;iteration<4;iteration++) {
    const surface=surfaceAt(ball.x,ball.z);
    const distance=(ball.y-surface.height)*surface.ny;
    if(distance<r) {
      const penetration=r-distance;
      ball.x+=surface.nx*penetration;ball.y+=surface.ny*penetration;ball.z+=surface.nz*penetration;
      reflect(ball,surface.nx,surface.ny,surface.nz,.68,1.4);
    }
    for(const wall of ARENA_SOLIDS) {
      let nx=ball.x-clamp(ball.x,wall.x-wall.hx,wall.x+wall.hx);
      let ny=ball.y-clamp(ball.y,wall.y-wall.hy,wall.y+wall.hy);
      let nz=ball.z-clamp(ball.z,wall.z-wall.hz,wall.z+wall.hz);
      let dist=Math.hypot(nx,ny,nz),depth=r-dist;
      if(depth<=0)continue;
      if(dist<.00001) {
        const faces=[['x',wall.hx-Math.abs(ball.x-wall.x)],['y',wall.hy-Math.abs(ball.y-wall.y)],['z',wall.hz-Math.abs(ball.z-wall.z)]];
        faces.sort((a,b)=>a[1]-b[1]);const axis=faces[0][0],sign=Math.sign(ball[axis]-wall[axis])||1;
        nx=axis==='x'?sign:0;ny=axis==='y'?sign:0;nz=axis==='z'?sign:0;depth=r+faces[0][1];
      }else{nx/=dist;ny/=dist;nz/=dist;}
      ball.x+=nx*(depth+.0001);ball.y+=ny*(depth+.0001);ball.z+=nz*(depth+.0001);
      reflect(ball,nx,ny,nz,.78,.5);
    }
    if(ball.y>24-r){ball.y=24-r;reflect(ball,0,-1,0,.72,.5);}
  }
}
function reflect(body,nx,ny,nz,restitution,settleSpeed) {
  const speed=body.vx*nx+body.vy*ny+body.vz*nz;
  if(speed>=0)return;
  const impulse=-speed*(Math.abs(speed)>settleSpeed?1+restitution:1);
  body.vx+=nx*impulse;body.vy+=ny*impulse;body.vz+=nz*impulse;
}
export function stepBall(ball,dt,cars=[],onHit=()=>{}) {
  // Substeps protect goalposts and corners even when this function gets a larger dt.
  const steps=Math.max(1,Math.ceil(dt/(1/120)),Math.ceil(Math.hypot(ball.vx,ball.vy,ball.vz)*dt/(FIELD.ballRadius*.4))),h=dt/steps,r=FIELD.ballRadius;
  for(let i=0;i<steps;i++) {
    ball.vy-=22*h;
    ball.x+=ball.vx*h;ball.y+=ball.vy*h;ball.z+=ball.vz*h;
    resolveBallArena(ball);
    // Resolve after integration, before snapshots/scoring. Revisit contacts when
    // another car or the floor pushes the ball back into a chassis.
    for(let pass=0;pass<8;pass++){
      let touched=false;
      for(const car of cars){
        if(!carBallContact(car,ball))continue;
        touched=true;const strength=collideCarBall(car,ball);if(strength)onHit(car,strength);
      }
      if(!touched)break;
      resolveBallArena(ball);
    }
    // Two opposing chassis can leave no room for the sphere between them.
    // Release that pinch above both roofs instead of alternating penetration.
    if(cars.length>1&&cars.some(car=>carBallContact(car,ball))){
      let roof=ball.y;
      for(const car of cars){
        if(Math.hypot(ball.x-car.x,ball.z-car.z)>4.5)continue;
        const frame=carFrame(car);
        roof=Math.max(roof,car.y+frame.up[1]*.55+Math.abs(frame.right[1])*1.24+Math.abs(frame.up[1])*.67+Math.abs(frame.forward[1])*1.98+FIELD.ballRadius+.002);
      }
      ball.y=Math.min(24-FIELD.ballRadius,roof);ball.vy=Math.max(0,ball.vy);
    }
    const surface=surfaceAt(ball.x,ball.z);
    const rolling=(ball.y-surface.height)*surface.ny<r+.04;
    const drag=Math.exp(-(rolling?.48:.12)*h);ball.vx*=drag;ball.vz*=drag;
    if(rolling&&Math.hypot(ball.vx,ball.vz)<.06&&surface.ny>.999){ball.vx=0;ball.vz=0;}
    ball.hitFlash=Math.max(0,(ball.hitFlash||0)-h*2.8);
    const fitsGoal=Math.abs(ball.x)<FIELD.goalHalfWidth-.325-r&&ball.y<FIELD.goalHeight-.325-r;
    if(fitsGoal&&Math.abs(ball.z)>FIELD.halfLength+r)return ball.z<0?'home':'away';
  }
  return null;
}
export function botInput(car, ball) {
  // Approach from behind the ball relative to the orange goal, then commit to a shot.
  let tx=ball.x, tz=ball.z-5;
  if(car.z < ball.z-2 && Math.abs(car.x-ball.x)<6){tx=ball.x;tz=ball.z+2;}
  if(car.z > ball.z+1){tx=ball.x+(car.x>=ball.x?7:-7);tz=ball.z-7;}
  const angle=Math.atan2(tx-car.x,-(tz-car.z)), error=wrapAngle(angle-car.yaw);
  return {throttle:Math.abs(error)>1.7?.3:1,steer:clamp(error*2.4,-1,1),boost:Math.abs(error)<.18&&Math.hypot(tx-car.x,tz-car.z)>16,drift:Math.abs(error)>1.4};
}

// The tyre path is a quarter-circle followed by a vertical straight section.
// Contact coordinates track travel along that surface; there is no snap or climb impulse.
const BANK_RADIUS=5,TYRE_OFFSET=.65,PATH_RADIUS=BANK_RADIUS-TYRE_OFFSET;
function surfacePose(car){
  const w=car.wall,limit=w.axis==='x'?FIELD.halfWidth:FIELD.halfLength;
  w.angle=Math.min(Math.PI/2,Math.max(0,w.path/PATH_RADIUS));
  car[w.axis]=w.sign*(limit-BANK_RADIUS+PATH_RADIUS*Math.sin(w.angle));
  car.y=BANK_RADIUS-PATH_RADIUS*Math.cos(w.angle)+Math.max(0,w.path-PATH_RADIUS*Math.PI/2);
  car['v'+w.axis]=w.sign*Math.cos(w.angle)*w.speed;car.vy=Math.sin(w.angle)*w.speed;
}
function attachWall(car){
  if(car.wallCooldown>0||car.y>21)return false;
  for(const axis of ['x','z']){
    const limit=axis==='x'?FIELD.halfWidth:FIELD.halfLength,sign=Math.sign(car[axis]);
    if(axis==='z'&&Math.abs(car.x)<FIELD.goalHalfWidth+5)continue;
    const tangent=axis==='x'?'z':'x',distance=Math.abs(car[axis])-(limit-BANK_RADIUS);
    if(car.grounded){
      if(distance<=0||distance>PATH_RADIUS||car['v'+axis]*sign<=.2||car.y>6)continue;
      const angle=Math.asin(clamp(distance/PATH_RADIUS,0,1));
      const speed=Math.hypot(car.vx,car.vz),along=car['v'+tangent];
      const climb=Math.sqrt(Math.max(0,speed*speed-along*along));
      const forward=carFrame(car).forward;
      car.wall={axis,sign,path:angle*PATH_RADIUS,angle,speed:climb,heading:Math.atan2(forward[axis==='x'?2:0],forward[axis==='x'?0:2]*sign)};
    }else{
      if(Math.abs(car[axis])<limit-1.2||car['v'+axis]*sign<0||car.y<5)continue;
      const frame=carFrame(car),index=axis==='x'?0:2;
      if(-sign*frame.up[index]<.8||car.flip>0)continue;
      car.wall={axis,sign,path:PATH_RADIUS*Math.PI/2+car.y-5,angle:Math.PI/2,speed:car.vy,heading:Math.atan2(frame.forward[axis==='x'?2:0],frame.forward[1])};
    }
    car.grounded=true;car.jumps=0;car.roll=0;surfacePose(car);return true;
  }
  return false;
}
function stepWallCar(car,input,dt){
  const w=car.wall,tangent=w.axis==='x'?'z':'x';
  // Accept saved states from older development scenarios.
  w.path??=PATH_RADIUS*Math.PI/2+car.y-5;w.speed??=car.vy;w.angle??=Math.PI/2;
  const throttle=clamp(input.throttle||0,-1,1),steer=clamp(input.steer||0,-1,1);
  const travel=w.speed*Math.cos(w.heading)+car['v'+tangent]*Math.sin(w.heading);
  // The surface's tangent coordinate is mirrored on opposite walls. Convert
  // steering to the chassis' right direction, just as on the ground.
  const handedness=w.axis==='x'?w.sign:-w.sign;
  const direction=travel<-1?-1:1;
  w.heading+=steeringResponse(car,steer,Math.abs(travel),input.drift,dt)*handedness*direction*dt;
  car.boosting=!!input.boost&&car.boost>0;car.boost=clamp(car.boost+(car.boosting?-26:8)*dt,0,100);
  const acceleration=throttle*24+(car.boosting?38:0);
  w.speed+=(Math.cos(w.heading)*acceleration-22*Math.sin(w.angle))*dt;
  car['v'+tangent]+=Math.sin(w.heading)*acceleration*dt;
  const lateral=car['v'+tangent]*Math.cos(w.heading)-w.speed*Math.sin(w.heading),grip=1-Math.exp(-(input.drift?3.8:steer===0?18:14)*dt);
  car['v'+tangent]-=lateral*Math.cos(w.heading)*grip;w.speed+=lateral*Math.sin(w.heading)*grip;
  const damping=Math.exp(-(throttle||car.boosting?.25:1.3)*dt);
  w.speed*=damping;car['v'+tangent]*=damping;
  const speed=Math.hypot(w.speed,car['v'+tangent]),max=car.boosting?43:28;
  if(speed>max){const k=Math.max(max/speed,Math.exp(-2*dt));w.speed*=k;car['v'+tangent]*=k;}
  w.path+=w.speed*dt;car[tangent]+=car['v'+tangent]*dt;
  surfacePose(car);
  const frame=carFrame(car);car.pitch=Math.asin(clamp(frame.forward[1],-1,1));
  if(Math.hypot(frame.forward[0],frame.forward[2])>.1)car.yaw=Math.atan2(frame.forward[0],-frame.forward[2]);
  car.flip=Math.max(0,car.flip-dt);car.hitCooldown=Math.max(0,car.hitCooldown-dt);
  const tangentLimit=tangent==='x'?FIELD.halfWidth:FIELD.halfLength;
  const atFloor=w.path<=0;
  if(atFloor||car.y>=21.5||Math.abs(car[tangent])>tangentLimit-5||(w.axis==='z'&&Math.abs(car.x)<14)){
    if(atFloor){car[w.axis]=w.sign*((w.axis==='x'?FIELD.halfWidth:FIELD.halfLength)-5+w.path);car.y=.65;car.vy=0;car.pitch=0;}
    car.wall=null;car.wallCooldown=.12;car.grounded=atFloor;
    resolveCarArena(car);
  }
}
function stepAerialCar(car,input,dt){
  const steer=clamp(input.steer||0,-1,1),pitchInput=clamp(input.throttle||0,-1,1);
  car.boosting=!!input.boost&&car.boost>0;
  // Assisted attitude control: holding forward selects a useful angle instead
  // of rotating forever. Boost + forward climbs; releasing input levels out.
  const targetPitch=pitchInput>0?pitchInput*(car.boosting?.92:.24):pitchInput<0?pitchInput*.65:(car.vy<-2?-.08:0);
  const pitchAcceleration=(targetPitch-car.pitch)*34-(car.pitchRate||0)*11;
  car.pitchRate=clamp((car.pitchRate||0)+pitchAcceleration*dt,-2.8,2.8);
  car.pitch=clamp(car.pitch+car.pitchRate*dt,-1.45,1.45);
  const turnTarget=input.drift?0:steer*1.7;
  car.yawRate=(car.yawRate||0)+(turnTarget-(car.yawRate||0))*(1-Math.exp(-10*dt));
  car.yaw+=car.yawRate*dt;
  if(input.drift){car.rollRate=(car.rollRate||0)+(steer*2.6-(car.rollRate||0))*(1-Math.exp(-10*dt));car.roll=wrapAngle(car.roll+car.rollRate*dt);}
  else{car.rollRate=0;car.roll=wrapAngle(car.roll)*Math.exp(-5*dt);}
  car.steer+=(steer-car.steer)*(1-Math.exp(-10*dt));
  car.boost=clamp(car.boost+(car.boosting?-26:0)*dt,0,100);
  const f=carFrame(car).forward,thrust=car.boosting?38:0;
  car.vx+=f[0]*thrust*dt;car.vy+=(f[1]*thrust-18)*dt;car.vz+=f[2]*thrust*dt;
  const speed=Math.hypot(car.vx,car.vy,car.vz);if(speed>48){const k=48/speed;car.vx*=k;car.vy*=k;car.vz*=k;}
  car.x+=car.vx*dt;car.y+=car.vy*dt;car.z+=car.vz*dt;
  attachWall(car);if(!car.wall)resolveCarArena(car);
  car.flip=Math.max(0,car.flip-dt);car.hitCooldown=Math.max(0,car.hitCooldown-dt);
}
