import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    doc,
    getDoc,
    setDoc,
    addDoc, 
    updateDoc, 
    deleteDoc, 
    onSnapshot  
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyDePcUImOpiguo8IyBbnvVmVRmd7uzIIhw",
    authDomain: "machikoto-keijiban.firebaseapp.com",
    projectId: "machikoto-keijiban",
    storageBucket: "machikoto-keijiban.firebasestorage.app",
    messagingSenderId: "57542828451",
    appId: "1:57542828451:web:0261da9e3feeb5860b7a16",
    measurementId: "G-K5K0G8YP5V"
};

const isFirebaseConfigured = Boolean(
    firebaseConfig && 
    firebaseConfig.apiKey && 
    firebaseConfig.apiKey.trim() !== "" &&
    firebaseConfig.projectId && 
    firebaseConfig.projectId.trim() !== ""
);

let firebaseApp = null;
let db = null;

if (isFirebaseConfigured) {
    try {
        firebaseApp = initializeApp(firebaseConfig);
        db = getFirestore(firebaseApp);
    } catch (err) {
        console.warn("Firebase init warning:", err);
    }
}

const App = {
    state: {
        currentUser: null,
        activeBoardUserId: null,
        cards: [],
        managers: {},
        isManager: false,
        isReadOnly: false,
        draggedCardId: null,
        dragOffset: { x: 0, y: 0 },
        unsubscribeCards: null
    },

    init() {
        this.bindEvents();
        this.checkUrlParams();
    },

    async checkUrlParams() {
        const urlParams = new URLSearchParams(window.location.search);
        const boardUserId = urlParams.get('board');

        if (boardUserId) {
            this.state.activeBoardUserId = boardUserId;
            this.state.isManager = false;
            this.state.isReadOnly = true;

            let managerName = boardUserId;
            if (db) {
                try {
                    const managerDoc = await getDoc(doc(db, "managers", boardUserId));
                    if (managerDoc.exists()) {
                        managerName = managerDoc.data().name || boardUserId;
                    }
                } catch (e) {
                    console.warn("Manager load warning:", e);
                }
            }

            this.state.currentUser = { docId: boardUserId, managerId: boardUserId, name: managerName };
            this.subscribeToRealtimeCards(boardUserId);
            this.render();
            this.switchToBoard();
        } else {
            this.render();
        }
    },

    subscribeToRealtimeCards(userId) {
        if (!db || !userId) return;
        if (this.state.unsubscribeCards) {
            this.state.unsubscribeCards();
        }

        const postsRef = collection(db, "managers", userId, "posts");
        this.state.unsubscribeCards = onSnapshot(postsRef, (snapshot) => {
            this.state.cards = [];
            snapshot.forEach((docSnap) => {
                this.state.cards.push({
                    id: docSnap.id,
                    ...docSnap.data()
                });
            });
            if (document.getElementById("boardScreen").classList.contains("active")) {
                this.renderBoard();
            }
        }, (error) => {
            console.error("Firestore sync error:", error);
        });
    },

    async handleRegister(e) {
        e.preventDefault();
        const managerId = document.getElementById("regId").value.trim();
        const password = document.getElementById("regPassword").value.trim();
        const name = document.getElementById("regName").value.trim();

        if (!managerId || !password || !name) return;

        if (managerId.length < 4 || password.length < 6) {
            alert("IDは4文字以上、パスワードは6文字以上で入力してください。");
            return;
        }

        try {
            if (db) {
                const managerDocRef = doc(db, "managers", managerId);
                const docSnap = await getDoc(managerDocRef);

                if (docSnap.exists()) {
                    alert("この管理IDは既に使用されています。");
                    return;
                }

                await setDoc(managerDocRef, {
                    password: password,
                    name: name,
                    createdAt: new Date()
                });
            } else {
                if (this.state.managers[managerId]) {
                    alert("この管理IDは既に使用されています。");
                    return;
                }
                this.state.managers[managerId] = {
                    password: password,
                    name: name
                };
            }

            alert("アカウントが正常に作成されました。ログインしてください。");

            document.getElementById("regId").value = "";
            document.getElementById("regPassword").value = "";
            document.getElementById("regName").value = "";
            
            document.getElementById("loginId").value = managerId;
            document.getElementById("loginPassword").value = "";

            this.toggleRegisterView(false);
            this.switchToGateway();

        } catch (error) {
            console.error("Registration error:", error);
            alert("登録処理中にエラーが発生いたしました。");
        }
    },

    async handleLogin(e) {
        e.preventDefault();
        const managerId = document.getElementById("loginId").value.trim();
        const password = document.getElementById("loginPassword").value.trim();

        if (managerId.length < 4 || password.length < 6) {
            alert("IDは4文字以上、パスワードは6文字以上で入力してください。");
            return;
        }

        try {
            let managerData = null;

            if (db) {
                const managerDocRef = doc(db, "managers", managerId);
                const docSnap = await getDoc(managerDocRef);

                if (!docSnap.exists()) {
                    alert("IDまたはパスワードが間違っています。");
                    return;
                }

                const data = docSnap.data();
                if (data.password !== password) {
                    alert("IDまたはパスワードが間違っています。");
                    return;
                }
                managerData = { docId: docSnap.id, managerId: docSnap.id, name: data.name };
            } else {
                const localManager = this.state.managers[managerId];
                if (!localManager || localManager.password !== password) {
                    alert("IDまたはパスワードが間違っています。");
                    return;
                }
                managerData = { docId: managerId, managerId: managerId, name: localManager.name };
            }

            this.state.currentUser = managerData;
            this.state.activeBoardUserId = managerData.docId;
            this.state.isManager = true;
            this.state.isReadOnly = false;
            
            if (db) {
                this.subscribeToRealtimeCards(managerData.docId);
            }

            this.render();
            this.switchToBoard();

        } catch (error) {
            console.error("Login error:", error);
            alert("ログイン処理中にエラーが発生いたしました。");
        }
    },

    async handleSaveCard(e) {
        e.preventDefault();
        if (!this.state.isManager || !this.state.activeBoardUserId) return;

        const text = document.getElementById("cardText").value.trim();
        const imageUrl = document.getElementById("cardImageUrl").value.trim();

        if (!text) return;

        const defaultX = 20 + (this.state.cards.length * 15) % 200;
        const defaultY = 20 + (this.state.cards.length * 15) % 200;

        try {
            if (db) {
                const postsRef = collection(db, "managers", this.state.activeBoardUserId, "posts");
                await addDoc(postsRef, {
                    text: text,
                    imageUrl: imageUrl,
                    x: defaultX,
                    y: defaultY,
                    createdAt: new Date()
                });
            } else {
                const newCard = {
                    id: "local_" + Date.now(),
                    text: text,
                    imageUrl: imageUrl,
                    x: defaultX,
                    y: defaultY
                };
                this.state.cards.push(newCard);
                this.renderBoard();
            }
            this.closeCardModal();
        } catch (error) {
            console.error("Card save error:", error);
            alert("カードの追加に失敗いたしました。");
        }
    },

    async deleteCard(id, e) {
        e.stopPropagation();
        if (!this.state.isManager || !this.state.activeBoardUserId) return;

        try {
            if (db) {
                await deleteDoc(doc(db, "managers", this.state.activeBoardUserId, "posts", id));
            } else {
                this.state.cards = this.state.cards.filter(c => c.id !== id);
                this.renderBoard();
            }
        } catch (error) {
            console.error("Card delete error:", error);
            alert("削除処理に失敗いたしました。");
        }
    },

    async clearAllCards() {
        if (!this.state.isManager || !this.state.activeBoardUserId) return;

        if (confirm("すべてのカードを削除してもよろしいですか？")) {
            try {
                if (db) {
                    const promises = this.state.cards.map(c => 
                        deleteDoc(doc(db, "managers", this.state.activeBoardUserId, "posts", c.id))
                    );
                    await Promise.all(promises);
                } else {
                    this.state.cards = [];
                    this.renderBoard();
                }
            } catch (error) {
                console.error("Clear all error:", error);
                alert("一括削除に失敗いたしました。");
            }
        }
    },

    async deleteAccount() {
        if (!this.state.currentUser || !this.state.isManager) return;

        if (confirm("アカウントを削除して初期画面に戻りますか？")) {
            try {
                if (db) {
                    const promises = this.state.cards.map(c => 
                        deleteDoc(doc(db, "managers", this.state.currentUser.docId, "posts", c.id))
                    );
                    await Promise.all(promises);
                    await deleteDoc(doc(db, "managers", this.state.currentUser.docId));
                } else {
                    delete this.state.managers[this.state.currentUser.managerId];
                }
                this.switchToGateway();
            } catch (error) {
                console.error("Delete account error:", error);
                alert("アカウント削除に失敗いたしました。");
            }
        }
    },

    async updateCardPositionInFirestore(id, x, y) {
        if (!db || !this.state.isManager || !this.state.activeBoardUserId) return;
        try {
            const cardRef = doc(db, "managers", this.state.activeBoardUserId, "posts", id);
            await updateDoc(cardRef, { x: x, y: y });
        } catch (error) {
            console.error("Position update error:", error);
        }
    },

    bindEvents() {
        const corkboard = document.getElementById("corkboard");

        corkboard.addEventListener("mousedown", (e) => this.handleDragStart(e));
        document.addEventListener("mousemove", (e) => this.handleDragMove(e));
        document.addEventListener("mouseup", () => this.handleDragEnd());

        corkboard.addEventListener("touchstart", (e) => this.handleDragStart(e), { passive: false });
        document.addEventListener("touchmove", (e) => this.handleDragMove(e), { passive: false });
        document.addEventListener("touchend", () => this.handleDragEnd());
    },

    toggleRegisterView(isRegister) {
        document.getElementById("loginFormBlock").style.display = isRegister ? "none" : "block";
        document.getElementById("registerFormBlock").style.display = isRegister ? "block" : "none";
    },

    switchToGateway() {
        if (this.state.unsubscribeCards) {
            this.state.unsubscribeCards();
            this.state.unsubscribeCards = null;
        }
        
        if (window.location.search) {
            window.history.pushState({}, document.title, window.location.pathname);
        }

        this.state.currentUser = null;
        this.state.activeBoardUserId = null;
        this.state.isManager = false;
        this.state.isReadOnly = false;
        this.state.cards = [];

        this.render();

        document.getElementById("gatewayScreen").classList.add("active");
        document.getElementById("boardScreen").classList.remove("active");
    },

    switchToBoard() {
        document.getElementById("gatewayScreen").classList.remove("active");
        document.getElementById("boardScreen").classList.add("active");
        this.renderBoard();
    },

    render() {
        const name = this.state.currentUser ? this.state.currentUser.name : "";
        const titleElem = document.getElementById("appTitle");
        const urlElem = document.getElementById("urlDisplay");

        if (name) {
            titleElem.textContent = ` MACHIKOTO - ひろば ${name}`;
            urlElem.textContent = `hiroba.japan-vi.be/?board=${encodeURIComponent(this.state.activeBoardUserId || name)}`;
        } else {
            titleElem.textContent = "ひろば";
            urlElem.textContent = "hiroba.japan-vi.be/";
        }

        const addCardBtn = document.getElementById("addCardBtn");
        const adminaccountActions = document.getElementById("adminaccountActions");
        const corkboard = document.getElementById("corkboard");

        if (this.state.isManager) {
            addCardBtn.style.display = "inline-flex";
            adminaccountActions.style.display = "flex";
            corkboard.classList.remove("read-only");
        } else {
            addCardBtn.style.display = "none";
            adminaccountActions.style.display = "none";
            corkboard.classList.add("read-only");
        }
    },

    renderBoard() {
        const corkboard = document.getElementById("corkboard");
        corkboard.innerHTML = "";

        this.state.cards.forEach(card => {
            const cardElem = document.createElement("div");
            cardElem.className = "postit-card";
            cardElem.dataset.id = card.id;
            cardElem.style.left = `${card.x || 0}px`;
            cardElem.style.top = `${card.y || 0}px`;

            let html = "";
            if (this.state.isManager) {
                html += `<button class="delete-btn" onclick="window.App.deleteCard('${card.id}', event)">DELETE</button>`;
            }
            if (card.imageUrl) {
                html += `<img src="${this.escapeHtml(card.imageUrl)}" class="postit-image" alt="添付画像" onerror="this.style.display='none'">`;
            }
            html += `<div class="postit-text">${this.escapeHtml(card.text || '')}</div>`;

            cardElem.innerHTML = html;

            if (!this.state.isManager) {
                cardElem.addEventListener("click", () => this.openViewModal(card));
            }

            corkboard.appendChild(cardElem);
        });
    },

    openCardModal() {
        if (!this.state.isManager) return;
        document.getElementById("cardModal").classList.add("active");
    },

    closeCardModal() {
        document.getElementById("cardModal").classList.remove("active");
        document.getElementById("cardText").value = "";
        document.getElementById("cardImageUrl").value = "";
    },

    openViewModal(card) {
        const container = document.getElementById("viewModalContent");
        let html = "";
        if (card.imageUrl) {
            html += `<img src="${this.escapeHtml(card.imageUrl)}" style="width:100%; max-height:300px; object-fit:contain; border-radius:8px; margin-bottom:15px;" alt="添付画像" onerror="this.style.display='none'">`;
        }
        html += `<p style="font-size:16px; line-height:1.6; white-space:pre-wrap;">${this.escapeHtml(card.text || '')}</p>`;
        container.innerHTML = html;
        document.getElementById("viewModal").classList.add("active");
    },

    closeViewModal() {
        document.getElementById("viewModal").classList.remove("active");
    },

    handleDragStart(e) {
        if (!this.state.isManager) return;

        const target = e.target.closest(".postit-card");
        if (!target || e.target.classList.contains("delete-btn")) return;

        this.state.draggedCardId = target.dataset.id;
        const rect = target.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        this.state.dragOffset.x = clientX - rect.left;
        this.state.dragOffset.y = clientY - rect.top;

        if (e.type === "touchstart") e.preventDefault();
    },

    handleDragMove(e) {
        if (!this.state.draggedCardId || !this.state.isManager) return;

        const corkboard = document.getElementById("corkboard");
        const boardRect = corkboard.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        let newX = clientX - boardRect.left - this.state.dragOffset.x;
        let newY = clientY - boardRect.top - this.state.dragOffset.y;

        newX = Math.max(0, Math.min(newX, boardRect.width - 220));
        newY = Math.max(0, Math.min(newY, boardRect.height - 100));

        const cardElem = corkboard.querySelector(`[data-id="${this.state.draggedCardId}"]`);
        if (cardElem) {
            cardElem.style.left = `${newX}px`;
            cardElem.style.top = `${newY}px`;
        }

        const card = this.state.cards.find(c => c.id === this.state.draggedCardId);
        if (card) {
            card.x = newX;
            card.y = newY;
        }

        if (e.type === "touchmove") e.preventDefault();
    },

    handleDragEnd() {
        if (this.state.draggedCardId && this.state.isManager) {
            const card = this.state.cards.find(c => c.id === this.state.draggedCardId);
            if (card) {
                this.updateCardPositionInFirestore(card.id, card.x, card.y);
            }
            this.state.draggedCardId = null;
        }
    },

    escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/[&<>"']/g, function(m) {
            return {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#039;'
            }[m];
        });
    }
};

window.App = App;

window.addEventListener("DOMContentLoaded", () => {
    App.init();
});