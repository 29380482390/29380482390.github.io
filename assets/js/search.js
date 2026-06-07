import { SEARCH_ENGINE } from "./config.js";

function updateSearch(rawValue){
  const value=(rawValue||"").trim();
  const q=value.toLowerCase();
  const bookmarks=[...document.querySelectorAll(".bookmark")];
  let best=null;
  let bestScore=-1;
  let matches=0;

  bookmarks.forEach(li=>{
    li.classList.remove("bookmark-match","bookmark-nomatch","primary-match");
    const title=li.dataset.title||"";
    const item={title,href:li.dataset.href||""};
    const score=q?scoreItem(item,q):0;
    const isMatch=q?score>=0:true;

    const label=li.querySelector(".label");
    if(!q){
      if(label)label.textContent=title;
      li.style.display="";
      return;
    }

    if(isMatch){
      matches++;
      li.classList.add("bookmark-match");
      li.style.display="";
      if(score>bestScore){
        bestScore=score;
        best=li;
      }
    }else{
      li.classList.add("bookmark-nomatch");
      li.style.display="";
    }

    if(label)label.innerHTML=highlightText(title,q);
  });

  if(best){
    best.classList.add("primary-match");
    best.scrollIntoView({behavior:"smooth",block:"nearest",inline:"nearest"});
    statusEl.textContent=`${matches} match${matches===1?"":"es"} — best: ${best.dataset.title}`;
  }else if(q){
    statusEl.textContent=`No bookmark match. Enter will search Startpage for “${value}”.`;
  }else{
    statusEl.textContent="Enter opens the best bookmark match. If nothing matches, Enter uses Startpage.";
  }

  return best;
}

function openBest(){
  const value=searchEl.value.trim();
  const best=updateSearch(value);
  if(best){
    best.querySelector(".bookmark-link").click();
    return;
  }
  if(value){
    location.href=SEARCH_ENGINE+encodeURIComponent(value);
  }
}

function escapeHtml(s){
  return String(s)
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#39;");
}

function scoreItem(item,query){
  const q=query.trim().toLowerCase();
  if(!q)return -1;
  const title=item.title.toLowerCase();
  const aliases=item.aliases||[];
  const href=item.href.toLowerCase();
  const hay=[title,href,...aliases].join(" ");

  if(title===q)return 100;
  if(aliases.some(a=>a.toLowerCase()===q))return 98;
  if(title.startsWith(q))return 90;
  if(aliases.some(a=>a.toLowerCase().startsWith(q)))return 88;
  if(hay.includes(q))return 70;
  return -1;
}

function highlightText(text,query){
  if(!query)return escapeHtml(text);
  const q=query.trim().replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
  if(!q)return escapeHtml(text);
  return escapeHtml(text).replace(new RegExp(`(${q})`,"ig"),"<mark>$1</mark>");
}
