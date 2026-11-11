const $ = s => document.querySelector(s);
const toast = msg => { const el=$("#toast"); el.textContent=msg; el.style.display="block"; setTimeout(()=>el.style.display="none",3200); };
$("#year").textContent = new Date().getFullYear();
async function loadRooms(){
  const params=new URLSearchParams();
  if($("#query").value.trim()) params.set("q",$("#query").value.trim());
  if($("#duration").value) params.set("duration",$("#duration").value);
  if($("#maxPrice").value) params.set("maxPrice",$("#maxPrice").value);
  const box=$("#rooms"); box.innerHTML="<p>Chargement…</p>";
  try{
    const res=await fetch("/api/rooms?"+params); const rooms=await res.json();
    $("#count").textContent=`${rooms.length} annonce(s)`;
    box.innerHTML=rooms.length?rooms.map(r=>`<article class="room-card" data-id="${r.id}">
      <div class="room-photo">${r.photos?.[0]?`<img src="${r.photos[0]}" alt="Photo de ${escapeHtml(r.title)}">`:"⌂"}</div>
      <div class="room-info"><span class="pill">${escapeHtml(r.duration)}</span><h3>${escapeHtml(r.title)}</h3>
      <div class="room-meta">⌖ ${escapeHtml(r.neighborhood||"")}${r.neighborhood?", ":""}${escapeHtml(r.city)}</div>
      <div class="price">${Number(r.price).toLocaleString("fr-FR")} FCFA</div></div></article>`).join(""):"<p>Aucune chambre ne correspond à cette recherche.</p>";
    box.querySelectorAll(".room-card").forEach(card=>card.addEventListener("click",()=>showRoom(card.dataset.id)));
  }catch(e){box.innerHTML="<p>Impossible de charger les annonces. Vérifiez que le serveur est démarré.</p>";}
}
function escapeHtml(v=""){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
$("#searchForm").addEventListener("submit",e=>{e.preventDefault();loadRooms();});
async function showRoom(id){
  const r=await (await fetch("/api/rooms/"+id)).json();
  $("#modalContent").innerHTML=`<span class="pill">${escapeHtml(r.duration)}</span><h2>${escapeHtml(r.title)}</h2>
  <div class="detail-photos">${(r.photos||[]).map(p=>`<img src="${p}" alt="Photo de la chambre">`).join("")||"<p>Photos à venir</p>"}</div>
  <h3 class="price">${Number(r.price).toLocaleString("fr-FR")} FCFA</h3><p>${escapeHtml(r.neighborhood)} · ${escapeHtml(r.city)}</p>
  <p>${escapeHtml(r.description)}</p><p><b>Équipements :</b> ${escapeHtml(r.amenities||"Non précisés")}</p>
  <p>${escapeHtml(r.address||"Adresse communiquée après contact")}</p>
  ${r.latitude&&r.longitude?`<p><a class="map-link" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(r.latitude+","+r.longitude)}">Voir l’itinéraire sur Google Maps ↗</a></p>`:""}
  <h3>Envoyer une demande</h3><form class="detail-form" id="contactForm"><input name="name" placeholder="Votre nom" required><input name="phone" placeholder="Votre numéro de téléphone" required><textarea name="message" placeholder="Votre message" rows="3" required></textarea><button class="btn">Envoyer le message</button></form>`;
  $("#modal").classList.remove("hidden");
  $("#contactForm").addEventListener("submit",async e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.target));data.roomId=id;const out=await fetch("/api/contact",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});const result=await out.json();toast(result.message||result.error);if(out.ok)e.target.reset();});
}
$("#closeModal").onclick=()=>$("#modal").classList.add("hidden");
$("#modal").addEventListener("click",e=>{if(e.target.id==="modal")$("#modal").classList.add("hidden");});
loadRooms();