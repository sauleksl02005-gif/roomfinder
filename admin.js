const $ = selector => document.querySelector(selector);

const toast = message => {
  const element = $("#toast");
  element.textContent = message;
  element.style.display = "block";
  setTimeout(() => { element.style.display = "none"; }, 3000);
};

async function readResponse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Erreur HTTP ${response.status}`);
  return data;
}

async function check() {
  try {
    const response = await fetch("/api/admin/me", { credentials: "same-origin" });
    const data = await readResponse(response);
    $("#loginBox").classList.toggle("hidden", data.authenticated);
    $("#dashboard").classList.toggle("hidden", !data.authenticated);
    if (data.authenticated) await refresh();
  } catch (error) {
    console.error("Vérification de session :", error);
    toast("Impossible de vérifier la session. Recharge la page.");
  }
}

$("#loginForm").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  try {
    const response = await fetch("/api/admin/login", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    await readResponse(response);
    form.reset();
    toast("Connexion réussie.");
    await check();
  } catch (error) {
    console.error("Connexion administrateur :", error);
    toast(error.message || "Échec de connexion.");
  }
});

$("#logout").addEventListener("click", async () => {
  try {
    const response = await fetch("/api/admin/logout", {
      method: "POST",
      credentials: "same-origin"
    });
    await readResponse(response);
    toast("Déconnexion effectuée.");
    await check();
  } catch (error) {
    toast(error.message || "Erreur pendant la déconnexion.");
  }
});

$("#useLocation").addEventListener("click", () => {
  const status = $("#locationStatus");
  if (!navigator.geolocation) {
    status.textContent = "La géolocalisation n'est pas prise en charge par ce navigateur.";
    return;
  }
  status.textContent = "Recherche de votre position… Autorisez la localisation si le navigateur le demande.";
  navigator.geolocation.getCurrentPosition(
    position => {
      $("#latitude").value = position.coords.latitude.toFixed(7);
      $("#longitude").value = position.coords.longitude.toFixed(7);
      status.textContent = "Coordonnées GPS récupérées. Vérifiez qu'elles correspondent bien à la chambre.";
    },
    error => {
      const messages = {
        1: "Autorisation refusée. Autorisez la localisation dans les réglages du navigateur.",
        2: "Position indisponible. Réessayez dans un endroit où le GPS capte mieux.",
        3: "La recherche de position a expiré. Réessayez."
      };
      status.textContent = messages[error.code] || "Impossible de récupérer la position.";
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
  );
});

$("#roomForm").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    const response = await fetch("/api/admin/rooms", {
      method: "POST",
      credentials: "same-origin",
      body: new FormData(form)
    });
    await readResponse(response);
    toast("Chambre publiée.");
    form.reset();
    $("#locationStatus").textContent = "";
    await refresh();
  } catch (error) {
    toast(error.message || "Impossible de publier la chambre.");
  }
});

async function refresh() {
  try {
    const [roomsResponse, messagesResponse] = await Promise.all([
      fetch("/api/admin/rooms", { credentials: "same-origin" }),
      fetch("/api/admin/messages", { credentials: "same-origin" })
    ]);
    const rooms = await readResponse(roomsResponse);
    const messages = await readResponse(messagesResponse);

    $("#adminRooms").innerHTML = rooms.length
      ? `<table class="admin-list"><tr><th>Chambre</th><th>Ville</th><th>Prix</th><th>Action</th></tr>${rooms.map(room =>
          `<tr><td>${escapeHtml(room.title)}</td><td>${escapeHtml(room.city)}</td><td>${Number(room.price).toLocaleString("fr-FR")} FCFA</td><td><button class="btn danger" data-delete="${escapeHtml(room.id)}">Supprimer</button></td></tr>`
        ).join("")}</table>`
      : "Aucune annonce.";

    document.querySelectorAll("[data-delete]").forEach(button => {
      button.addEventListener("click", async () => {
        if (!confirm("Supprimer cette annonce ?")) return;
        try {
          const response = await fetch(`/api/admin/rooms/${encodeURIComponent(button.dataset.delete)}`, {
            method: "DELETE",
            credentials: "same-origin"
          });
          await readResponse(response);
          toast("Annonce supprimée.");
          await refresh();
        } catch (error) {
          toast(error.message || "Suppression impossible.");
        }
      });
    });

    $("#messages").innerHTML = messages.length
      ? messages.map(message =>
          `<article><b>${escapeHtml(message.name)}</b> — ${escapeHtml(message.phone)}<p>${escapeHtml(message.roomTitle)} : ${escapeHtml(message.message)}</p><small>${new Date(message.createdAt).toLocaleString("fr-FR")}</small><hr></article>`
        ).join("")
      : "Aucun message reçu pour le moment.";
  } catch (error) {
    console.error("Chargement du tableau de bord :", error);
    toast(error.message || "Impossible de charger les données administrateur.");
  }
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

check();
