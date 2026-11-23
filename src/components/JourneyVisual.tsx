import { useEffect, useRef } from 'react'

const stages=['ACCOUNT','APPLICATION','VERIFICATION','SERVICES']
// Simplified geoBoundaries Kenya ADM0 outline, in longitude/latitude order.
const kenyaOutline:[number,number][]=[[40.993,-.85829],[41.58513,-1.68325],[40.88477,-2.08255],[40.63785,-2.49979],[40.26304,-2.57309],[40.12119,-3.27768],[39.80006,-3.68116],[39.60489,-4.34653],[39.20222,-4.67677],[37.7669,-3.67712],[37.69869,-3.09699],[34.07262,-1.05982],[33.903711,-.95],[33.893569,.109814],[34.18,.515],[34.6721,1.17694],[35.03599,1.90584],[34.59607,3.05374],[34.47913,3.5556],[34.005,4.249885],[34.620196,4.847123],[35.298007,5.506],[35.817448,5.338232],[35.817448,4.776966],[36.159079,4.447864],[36.855093,4.447864],[38.120915,3.598605],[38.43697,3.58851],[38.67114,3.61607],[38.89251,3.50074],[39.559384,3.42206],[39.85494,3.83879],[40.76848,4.25702],[41.1718,3.91909],[41.855083,3.918912],[40.98105,2.78452],[40.993,-.85829]]
const kenyaPlaces=[{lat:-1.28333,lon:36.81667},{lat:-4.055,lon:39.664},{lat:-.10221,lon:34.76171},{lat:-.30719,lon:36.07225},{lat:.52036,lon:35.26993},{lat:.284219,lon:34.752285},{lat:-1.85238,lon:36.77683},{lat:-.420132,lon:36.947594},{lat:.04626,lon:37.65587},{lat:-.452752,lon:39.64601},{lat:-1.522333,lon:37.265212},{lat:1.015725,lon:35.006217}]

export default function JourneyVisual(){
  const ref=useRef<HTMLCanvasElement>(null)
  useEffect(()=>{
    const canvas=ref.current!
    const ctx=canvas.getContext('2d')!
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let active=false,raf=0,t=0
    const resize=()=>{const box=canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,1.5);canvas.width=Math.round(box.width*dpr);canvas.height=Math.round(box.height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0)}
    const observer=new IntersectionObserver(([entry])=>{active=entry.isIntersecting;if(active)draw()}, {threshold:.08})
    observer.observe(canvas);resize();window.addEventListener('resize',resize)
    function draw(){if(!active)return
      const w=canvas.clientWidth,h=canvas.clientHeight,cx=w/2,cy=h/2
      ctx.clearRect(0,0,w,h)
      const project=(x:number,y:number,z:number)=>{const depth=300/(300+z);return{x:cx+x*depth,y:cy+y*depth,scale:depth}}
      const nodes=stages.map((_,i)=>{const u=i/(stages.length-1),x=(u-.5)*w*.72,y=Math.sin(u*Math.PI*2+t)*h*.11,z=Math.cos(u*Math.PI*2+t)*32;return{...project(x,y,z),z,u}})
      // Perspective floor grid
      ctx.save();ctx.strokeStyle='#0b4a8a16';ctx.lineWidth=1
      for(let i=-5;i<=5;i++){ctx.beginPath();ctx.moveTo(cx+i*22,cy+h*.2);ctx.lineTo(cx+i*76,cy+h*.48);ctx.stroke()}
      for(let j=0;j<5;j++){const yy=cy+h*(.2+j*.06);ctx.beginPath();ctx.moveTo(cx-w*.42,yy);ctx.lineTo(cx+w*.42,yy);ctx.stroke()}
      ctx.restore()
      // Accurate Kenya silhouette and geographic reference points sit behind the four journey cards.
      const mapH=Math.min(h*.55,w*.47*1.28),mapW=mapH/1.28,mapX=cx-mapW/2,mapY=cy-mapH*.52
      const mapPoint=(lon:number,lat:number)=>({x:mapX+(lon-33.893569)/(41.855083-33.893569)*mapW,y:mapY+(5.506-lat)/(5.506+4.67677)*mapH})
      ctx.save();ctx.globalAlpha=.76;ctx.beginPath();kenyaOutline.forEach(([lon,lat],i)=>{const p=mapPoint(lon,lat);if(i)ctx.lineTo(p.x,p.y);else ctx.moveTo(p.x,p.y)});ctx.closePath();ctx.fillStyle='#0b2f59';ctx.shadowColor='#cfaa4b';ctx.shadowBlur=19;ctx.fill();ctx.shadowBlur=0;ctx.strokeStyle='#d6ae50';ctx.lineWidth=1.8;ctx.stroke()
      const cityPairs:[[number,number],...Array<[number,number]>]=[[0,1],[0,2],[0,3],[0,4],[4,11],[2,5],[0,6],[0,7],[0,8],[0,9],[0,10]]
      ctx.lineWidth=1;ctx.strokeStyle='#f2ce72b8';ctx.setLineDash([3,3]);cityPairs.forEach(([a,b])=>{const p=mapPoint(kenyaPlaces[a].lon,kenyaPlaces[a].lat),q=mapPoint(kenyaPlaces[b].lon,kenyaPlaces[b].lat);ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.stroke()});ctx.setLineDash([])
      kenyaPlaces.forEach((place,i)=>{const p=mapPoint(place.lon,place.lat);ctx.beginPath();ctx.arc(p.x,p.y,i===0?3.2:2,0,Math.PI*2);ctx.fillStyle=i===0?'#fff0b4':'#ffd66a';ctx.shadowColor='#f3c74f';ctx.shadowBlur=7;ctx.fill();ctx.shadowBlur=0});ctx.restore()
      // Curved light path, projected through depth
      ctx.beginPath();nodes.forEach((n,i)=>i?ctx.lineTo(n.x,n.y):ctx.moveTo(n.x,n.y));ctx.strokeStyle='#c7931a66';ctx.lineWidth=3;ctx.shadowColor='#e3b846';ctx.shadowBlur=14;ctx.stroke();ctx.shadowBlur=0
      nodes.forEach((n,i)=>{
        const size=28*n.scale
        ctx.save();ctx.translate(n.x,n.y);ctx.transform(1,.22,-.34,.78,0,0)
        ctx.fillStyle='#062b57';ctx.shadowColor='#082d6840';ctx.shadowBlur=18;ctx.fillRect(-size,-size*.7,size*2,size*1.4)
        ctx.strokeStyle='#e2b844';ctx.lineWidth=1.4;ctx.strokeRect(-size,-size*.7,size*2,size*1.4);ctx.restore()
        const pulse=1+Math.sin(t*2+i)*.13
        ctx.beginPath();ctx.arc(n.x,n.y,6*pulse*n.scale,0,Math.PI*2);ctx.fillStyle=i===3?'#f3c74f':'#fff';ctx.shadowColor='#f3c74f';ctx.shadowBlur=18;ctx.fill();ctx.shadowBlur=0
        ctx.textAlign='center';ctx.font=`700 ${Math.max(8,9*n.scale)}px DM Sans, sans-serif`;ctx.fillStyle='#143c69';ctx.fillText(stages[i],n.x,n.y+size*1.25)
      })
      if(!reduced){t+=.008;raf=requestAnimationFrame(draw)}
    }
    draw();return()=>{cancelAnimationFrame(raf);observer.disconnect();window.removeEventListener('resize',resize)}
  },[])
  return <div className="journey-visual" role="img" aria-label="Animated four-stage membership journey: account, application, verification and approved services"><canvas ref={ref}/></div>
}
