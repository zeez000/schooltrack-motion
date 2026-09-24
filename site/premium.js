(() => {
  'use strict';
  const $ = (s,r=document) => r.querySelector(s);
  const $$ = (s,r=document) => [...r.querySelectorAll(s)];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  function initPremiumFlow(){
    if (!$('.scroll-progress')) {
      const progress=document.createElement('div');
      progress.className='scroll-progress';
      progress.setAttribute('aria-hidden','true');
      progress.innerHTML='<span></span>';
      document.body.prepend(progress);
    }
    const bar=$('.scroll-progress > span'), header=$('.site-header');
    const onScroll=()=>{
      const max=Math.max(1,document.documentElement.scrollHeight-innerHeight);
      if(bar) bar.style.transform=`scaleX(${Math.min(1,Math.max(0,scrollY/max))})`;
      header?.classList.toggle('scrolled',scrollY>18);
    };
    addEventListener('scroll',onScroll,{passive:true}); onScroll();

    if ('IntersectionObserver' in window) {
      const sectionObserver=new IntersectionObserver(entries=>{
        const visible=entries.filter(e=>e.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];
        if(!visible)return;
        $$('.site-header nav a').forEach(a=>a.classList.toggle('active',a.getAttribute('href')===`#${visible.target.id}`));
      },{rootMargin:'-22% 0px -58% 0px',threshold:[0,.15,.35,.6]});
      ['experience','journey','people'].forEach(id=>{const el=$('#'+id);if(el)sectionObserver.observe(el)});
    }

    const fine=matchMedia('(hover:hover) and (pointer:fine)').matches;
    if(fine&&!reduced.matches){
      const magnetize=()=>{
        $$('.button,.control-button,.icon-button,.map-open').filter(el=>!el.disabled&&!el.dataset.premiumMagnet).forEach(el=>{
          el.dataset.premiumMagnet='1'; el.classList.add('magnetic');
          el.addEventListener('pointermove',e=>{
            const r=el.getBoundingClientRect(),dx=e.clientX-r.left-r.width/2,dy=e.clientY-r.top-r.height/2;
            el.style.transform=`translate(${dx*.10}px,${dy*.14}px)`;
          });
          el.addEventListener('pointerleave',()=>{el.style.transform=''});
        });
      };
      magnetize();
      const app=$('#app-content'); if(app) new MutationObserver(magnetize).observe(app,{childList:true,subtree:true});
      const art=$('.hero-art');
      if(art){
        let tx=0,ty=0,cx=0,cy=0,raf=0;
        const loop=()=>{cx+=(tx-cx)*.11;cy+=(ty-cy)*.11;art.style.transform=`rotateX(${cy}deg) rotateY(${cx}deg) rotateZ(-1.2deg)`;if(Math.abs(tx-cx)+Math.abs(ty-cy)>.02)raf=requestAnimationFrame(loop);else raf=0};
        art.addEventListener('pointermove',e=>{const r=art.getBoundingClientRect();tx=((e.clientX-r.left)/r.width-.5)*5;ty=-((e.clientY-r.top)/r.height-.5)*4;if(!raf)raf=requestAnimationFrame(loop)});
        art.addEventListener('pointerleave',()=>{tx=0;ty=0;if(!raf)raf=requestAnimationFrame(loop)});
      }
    }
  }

  function initGsap(){
    if(!window.gsap||!window.ScrollTrigger||reduced.matches)return;
    const gsap=window.gsap,ST=window.ScrollTrigger;gsap.registerPlugin(ST);
    gsap.fromTo('.hero-copy',{y:18,opacity:.92},{y:0,opacity:1,duration:.9,ease:'power3.out'});
    gsap.to('.hero-copy',{y:-34,ease:'none',scrollTrigger:{trigger:'.hero',start:'top top+=90',end:'bottom top+=140',scrub:.8}});
    gsap.to('.hero-art',{y:48,ease:'none',scrollTrigger:{trigger:'.hero',start:'top top+=80',end:'bottom top+=100',scrub:1.15}});
    gsap.from('.value-strip > *',{y:14,opacity:0,stagger:.08,duration:.65,ease:'power2.out',scrollTrigger:{trigger:'.value-strip',start:'top 88%',once:true}});
    gsap.from('.journey-card',{y:46,opacity:0,stagger:.12,duration:.85,ease:'power3.out',scrollTrigger:{trigger:'.journey-cards',start:'top 82%',once:true}});
    gsap.from('.person-card',{y:36,opacity:0,stagger:.1,duration:.8,ease:'power3.out',scrollTrigger:{trigger:'.people-grid',start:'top 84%',once:true}});
    gsap.fromTo('.closing-decoration',{y:34,rotate:-4},{y:-18,rotate:2,ease:'none',scrollTrigger:{trigger:'.closing',start:'top bottom',end:'bottom top',scrub:1}});
    ST.refresh();
  }

  function loadGsap(){
    if(!/^https?:$/.test(location.protocol)||reduced.matches)return;
    if(window.gsap){
      const st=document.createElement('script');st.src='https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/ScrollTrigger.min.js';st.async=true;st.referrerPolicy='no-referrer';st.onload=initGsap;document.head.append(st);return;
    }
    const gs=document.createElement('script');gs.src='https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/gsap.min.js';gs.async=true;gs.referrerPolicy='no-referrer';
    gs.onload=()=>{const st=document.createElement('script');st.src='https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/ScrollTrigger.min.js';st.async=true;st.referrerPolicy='no-referrer';st.onload=initGsap;document.head.append(st)};
    document.head.append(gs);
  }

  addEventListener('DOMContentLoaded',()=>{initPremiumFlow();loadGsap()});
})();