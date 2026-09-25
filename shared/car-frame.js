// Orthonormal chassis axes shared by rendering, thrust, and ball contacts.
export function carFrame(car){
  let f,u;
  if(car.wall){
    const {axis,sign,heading}=car.wall;
    const angle=car.wall.angle??Math.PI/2,c=Math.cos(angle),s=Math.sin(angle);
    u=axis==='x'?[-sign*s,c,0]:[0,c,-sign*s];
    f=axis==='x'?[sign*c*Math.cos(heading),s*Math.cos(heading),Math.sin(heading)]:[Math.sin(heading),s*Math.cos(heading),sign*c*Math.cos(heading)];
  }else{
    const p=car.pitch||0,y=car.yaw;
    f=[Math.sin(y)*Math.cos(p),Math.sin(p),-Math.cos(y)*Math.cos(p)];
    u=[-Math.sin(y)*Math.sin(p),Math.cos(p),Math.cos(y)*Math.sin(p)];
  }
  let r=[f[1]*u[2]-f[2]*u[1],f[2]*u[0]-f[0]*u[2],f[0]*u[1]-f[1]*u[0]];
  const roll=car.wall?0:car.roll||0,c=Math.cos(roll),s=Math.sin(roll);
  const up=u.map((v,i)=>v*c-r[i]*s);r=r.map((v,i)=>v*c+u[i]*s);
  return {forward:f,up,right:r};
}
