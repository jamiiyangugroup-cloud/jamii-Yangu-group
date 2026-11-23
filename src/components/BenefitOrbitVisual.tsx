import { useEffect, useRef } from 'react'

const objects=[{x:-.62,y:-.02,z:-.15,s:.62,c:'#174d88'},{x:.02,y:.12,z:.18,s:.78,c:'#b98a18'},{x:.64,y:-.06,z:-.1,s:.58,c:'#0b3263'}]
export default function BenefitOrbitVisual(){
  const ref=useRef<HTMLCanvasElement>(null)
  useEffect(()=>{
    const canvas=ref.current!
    if(!canvas)return
    const ctx=canvas.getContext('2d')!
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf=0,t=0,visible=false
    const resize=()=>{const r=canvas.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,innerWidth<=480?1:1.5);canvas.width=Math.max(1,Math.round(r.width*d));canvas.height=Math.max(1,Math.round(r.height*d));ctx.setTransform(d,0,0,d,0,0)}
    const observer=new IntersectionObserver(([e])=>{visible=e.isIntersecting;if(visible)draw()},{threshold:.05});observer.observe(canvas);resize();addEventListener('resize',resize)
    function draw(){if(!visible)return
      const w=canvas.clientWidth,h=canvas.clientHeight,cx=w/2,cy=h/2
      ctx.clearRect(0,0,w,h)
      const project=(x:number,y:number,z:number)=>{const f=260/(260+z);return{x:cx+x*f,y:cy+y*f}}
      // A shallow orbital ring gives the objects a shared spatial frame.
      ctx.beginPath();ctx.ellipse(cx,cy+8,w*.37,h*.31,-.08,0,Math.PI*2);ctx.strokeStyle='#c69a3266';ctx.lineWidth=1;ctx.stroke()
      for(const [i,o] of objects.entries()){
        const a=t*(i%2?-.23:.2)+i*.75, bob=Math.sin(t*1.4+i)*7
        const raw=[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]] as const
        const vertices=raw.map(([x,y,z])=>{const X=x*o.s,Y=y*o.s,Z=z*o.s;const xx=X*Math.cos(a)-Z*Math.sin(a),zz=X*Math.sin(a)+Z*Math.cos(a);return project(xx*75+o.x*w*.38,Y*75+bob,zz*80+o.z*80)})
        const faces=[[0,1,2,3],[4,7,6,5],[0,4,5,1],[1,5,6,2],[2,6,7,3],[3,7,4,0]]
        faces.forEach((face,j)=>{ctx.beginPath();face.forEach((v,k)=>{const p=vertices[v];k?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y)});ctx.closePath();ctx.fillStyle=j===0?o.c:j===1?'#f2ca60':j%2?'#174981':'#0a2c53';ctx.strokeStyle='#ffe3a0b0';ctx.lineWidth=1;ctx.shadowColor=o.c;ctx.shadowBlur=j===1?17:4;ctx.fill();ctx.stroke();ctx.shadowBlur=0})
      }
      if(!reduced){t+=.012;raf=requestAnimationFrame(draw)}
    }
    draw();return()=>{cancelAnimationFrame(raf);observer.disconnect();removeEventListener('resize',resize)}
  },[])
  return <div className="benefit-orbit" role="img" aria-label="Animated three-dimensional geometric objects representing shared member opportunities"><canvas ref={ref}/><img src="/jamii-yangu-emblem.png" alt=""/></div>
}
