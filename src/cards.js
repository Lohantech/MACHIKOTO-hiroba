import { state } from './state.js';
import { db } from './firebase.js';
import { collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { escapeHtml } from './ui.js';

const PADDING = 10; 
const CARD_WIDTH = 165;
const CARD_HEIGHT = 100;

// Dimensions de référence du faux smartphone (anciennes positions en px)
const REF_W = 400;
const REF_H = 750;

// Les positions sont stockées en fractions (0..1) de la taille du tableau : xp / yp.
// Les anciens widgets (x / y en px) sont convertis automatiquement.
function getCardFraction(card) {
    const xp = typeof card.xp === "number" ? card.xp : (card.x ?? PADDING) / REF_W;
    const yp = typeof card.yp === "number" ? card.yp : (card.y ?? PADDING) / REF_H;
    return { xp, yp };
}

// Place une carte en pourcentage et la garde dans le tableau (selon sa taille réelle)
function placeCard(cardElem, xp, yp) {
    const corkboard = document.getElementById("corkboard");
    if (!corkboard) return { xp, yp };
    const bw = corkboard.clientWidth || REF_W;
    const bh = corkboard.clientHeight || REF_H;
    const cw = cardElem.offsetWidth || CARD_WIDTH;
    const ch = cardElem.offsetHeight || CARD_HEIGHT;
    const pad = Math.max(4, PADDING * (bw / REF_W));

    const minXp = pad / bw;
    const minYp = pad / bh;
    const maxXp = Math.max(minXp, (bw - cw - pad) / bw);
    const maxYp = Math.max(minYp, (bh - ch - pad) / bh);

    const cxp = Math.min(Math.max(minXp, xp), maxXp);
    const cyp = Math.min(Math.max(minYp, yp), maxYp);

    cardElem.style.left = `${cxp * 100}%`;
    cardElem.style.top = `${cyp * 100}%`;
    return { xp: cxp, yp: cyp };
}

export function subscribeToRealtimeCards(userId) {
    if (!userId) return;
    
    if (state.unsubscribeCards) {
        state.unsubscribeCards();
        state.unsubscribeCards = null;
    }

    if (db) {
        const postsRef = collection(db, "managers", userId, "posts");
        state.unsubscribeCards = onSnapshot(postsRef, (snapshot) => {
            state.cards = [];
            snapshot.forEach((docSnap) => {
                state.cards.push({
                    id: docSnap.id,
                    ...docSnap.data()
                });
            });
            if (document.getElementById("boardScreen").classList.contains("active")) {
                renderBoard();
            }
        }, (error) => {
            console.error("Firestore sync error:", error);
        });
    } else {
        const localCardsKey = `machikoto_cards_${userId}`;
        state.cards = JSON.parse(localStorage.getItem(localCardsKey) || "[]");
        if (document.getElementById("boardScreen").classList.contains("active")) {
            renderBoard();
        }
    }
}

export async function handleSaveCard(e) {
    e.preventDefault();
    if (!state.isManager || !state.activeBoardUserId) return;

    const text = document.getElementById("cardText").value.trim();
    const imageFile = document.getElementById("cardImageFile").files[0];

    if (!text && !imageFile) return;

    let imageUrl = "";

    if (imageFile) {
        try {
            const formData = new FormData();
            formData.append("image", imageFile);

            const response = await fetch("https://api.imgbb.com/1/upload?key=c43558f4d66062400d67dd841129fcec", {
                method: "POST",
                body: formData
            });
            const result = await response.json();

            if (result && result.success && result.data && result.data.url) {
                imageUrl = result.data.url;
            } else {
                alert("画像のアップロードに失敗しました。");
                return;
            }
        } catch (err) {
            console.error("BBimage upload error:", err);
            alert("画像アップロード中にエラーが発生しました。");
            return;
        }
    }

    // Position par défaut en fraction du tableau (indépendante de la taille d'écran)
    const defaultXp = (15 + (state.cards.length * 15) % 180) / REF_W;
    const defaultYp = (25 + (state.cards.length * 15) % 350) / REF_H;

    try {
        if (db) {
            const postsRef = collection(db, "managers", state.activeBoardUserId, "posts");
            await addDoc(postsRef, {
                text: text,
                imageUrl: imageUrl,
                xp: defaultXp,
                yp: defaultYp,
                createdAt: new Date()
            });
        } else {
            const newCard = {
                id: "local_" + Date.now(),
                text: text,
                imageUrl: imageUrl,
                xp: defaultXp,
                yp: defaultYp
            };
            state.cards.push(newCard);
            localStorage.setItem(`machikoto_cards_${state.activeBoardUserId}`, JSON.stringify(state.cards));
            renderBoard();
        }
        closeCardModal();
    } catch (error) {
        console.error("Card save error:", error);
        alert("ウィジェットの追加に失敗いたしました。");
    }
}

export async function deleteCard(id, e) {
    if (e) e.stopPropagation();
    if (!state.isManager || !state.activeBoardUserId) return;

    try {
        if (db) {
            await deleteDoc(doc(db, "managers", state.activeBoardUserId, "posts", id));
        } else {
            state.cards = state.cards.filter(c => c.id !== id);
            localStorage.setItem(`machikoto_cards_${state.activeBoardUserId}`, JSON.stringify(state.cards));
            renderBoard();
        }
    } catch (error) {
        console.error("Card delete error:", error);
        alert("削除処理に失敗いたしました。");
    }
}

export async function clearAllCards() {
    if (!state.isManager || !state.activeBoardUserId) return;

    if (confirm("すべてのウィジェットを削除してもよろしいですか？")) {
        try {
            if (db) {
                const promises = state.cards.map(c => 
                    deleteDoc(doc(db, "managers", state.activeBoardUserId, "posts", c.id))
                );
                await Promise.all(promises);
            } else {
                state.cards = [];
                localStorage.setItem(`machikoto_cards_${state.activeBoardUserId}`, JSON.stringify(state.cards));
                renderBoard();
            }
        } catch (error) {
            console.error("Clear all error:", error);
            alert("一括削除に失敗いたしました。");
        }
    }
}

export async function updateCardPositionInFirestore(id, xp, yp) {
    if (!state.isManager || !state.activeBoardUserId) return;
    try {
        if (db) {
            const cardRef = doc(db, "managers", state.activeBoardUserId, "posts", id);
            await updateDoc(cardRef, { xp: xp, yp: yp });
        } else {
            localStorage.setItem(`machikoto_cards_${state.activeBoardUserId}`, JSON.stringify(state.cards));
        }
    } catch (error) {
        console.error("Position update error:", error);
    }
}

export function renderBoard() {
    const corkboard = document.getElementById("corkboard");
    if (!corkboard) return;
    corkboard.innerHTML = "";

    state.cards.forEach(card => {
        const cardElem = document.createElement("div");
        cardElem.className = "postit-card";
        cardElem.dataset.id = card.id;

        const { xp, yp } = getCardFraction(card);

        let html = "";
        if (state.isManager) {
            html += `<button class="delete-btn" data-card-id="${card.id}">✕</button>`;
        }
        if (card.imageUrl) {
            html += `<img src="${escapeHtml(card.imageUrl)}" class="postit-image" alt="添付画像" onerror="this.style.display='none'">`;
        }
        if (card.text) {
            html += `<div class="postit-text">${escapeHtml(card.text)}</div>`;
        }

        cardElem.innerHTML = html;

        if (state.isManager) {
            const delBtn = cardElem.querySelector(".delete-btn");
            if (delBtn) {
                delBtn.onclick = (e) => deleteCard(card.id, e);
            }
        } else {
            cardElem.addEventListener("click", () => openViewModal(card));
        }

        corkboard.appendChild(cardElem);

        // Mesure réelle après insertion dans le DOM, puis position en %
        placeCard(cardElem, xp, yp);
        const img = cardElem.querySelector(".postit-image");
        if (img) {
            // La hauteur peut changer après chargement de l'image : on recale
            img.addEventListener("load", () => placeCard(cardElem, xp, yp));
        }
    });
}

// Recale les cartes si l'écran change (rotation, redimensionnement)
let resizeTimer = null;
window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        const board = document.getElementById("boardScreen");
        if (board && board.classList.contains("active")) renderBoard();
    }, 150);
});

export function openCardModal() {
    if (!state.isManager) return;
    const modal = document.getElementById("cardModal");
    if (modal) modal.classList.add("active");
}

export function closeCardModal() {
    const modal = document.getElementById("cardModal");
    if (modal) modal.classList.remove("active");
    const cardText = document.getElementById("cardText");
    const cardImg = document.getElementById("cardImageFile");
    const fileNameDisplay = document.getElementById("fileNameDisplay");
    if (cardText) cardText.value = "";
    if (cardImg) cardImg.value = "";
    if (fileNameDisplay) fileNameDisplay.textContent = "選択されていません";
}

export function openViewModal(card) {
    const container = document.getElementById("viewModalContent");
    if (!container) return;
    let html = "";
    if (card.imageUrl) {
        html += `<img src="${escapeHtml(card.imageUrl)}" style="width:100%; max-height:250px; object-fit:contain; border-radius:12px; margin-bottom:15px;" alt="添付画像" onerror="this.style.display='none'">`;
    }
    if (card.text) {
        html += `<p style="font-size:15px; line-height:1.6; white-space:pre-wrap;">${escapeHtml(card.text)}</p>`;
    }
    container.innerHTML = html;
    const viewModal = document.getElementById("viewModal");
    if (viewModal) viewModal.classList.add("active");
}

export function closeViewModal() {
    const viewModal = document.getElementById("viewModal");
    if (viewModal) viewModal.classList.remove("active");
}

export function handleDragStart(e) {
    if (!state.isManager) return;

    const target = e.target.closest(".postit-card");
    if (!target || e.target.classList.contains("delete-btn")) return;

    state.draggedCardId = target.dataset.id;
    const rect = target.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    state.dragOffset.x = clientX - rect.left;
    state.dragOffset.y = clientY - rect.top;

    if (e.type === "touchstart") {
        // Empêche le scroll lors du glisser du widget
        e.stopPropagation();
    }
}

export function handleDragMove(e) {
    if (!state.draggedCardId || !state.isManager) return;

    const corkboard = document.getElementById("corkboard");
    if (!corkboard) return;
    
    const boardRect = corkboard.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const newX = clientX - boardRect.left - state.dragOffset.x;
    const newY = clientY - boardRect.top - state.dragOffset.y;

    const cardElem = corkboard.querySelector('[data-id="' + state.draggedCardId + '"]');

    if (cardElem && boardRect.width > 0 && boardRect.height > 0) {
        // Position en fraction du tableau, bornée selon la taille réelle de la carte
        const placed = placeCard(cardElem, newX / boardRect.width, newY / boardRect.height);
        const card = state.cards.find(c => c.id === state.draggedCardId);
        if (card) {
            card.xp = placed.xp;
            card.yp = placed.yp;
        }
    }

    if (e.type === "touchmove") e.preventDefault();
}

export function handleDragEnd() {
    if (state.draggedCardId && state.isManager) {
        const card = state.cards.find(c => c.id === state.draggedCardId);
        if (card) {
            updateCardPositionInFirestore(card.id, card.xp, card.yp);
        }
        state.draggedCardId = null;
    }
}