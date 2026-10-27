import { state } from './state.js';
import { db } from './firebase.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { subscribeToRealtimeCards } from './cards.js';
import { loadUserWallpaper, resetWallpaper } from './wallpaper.js';

export function initClock() {
    const updateHeaderClock = () => {
        const tz = 'Asia/Tokyo';
        const now = new Date();
        
        try {
            const timeFormatter = new Intl.DateTimeFormat('en-GB', {
                timeZone: tz,
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });
            const timeStr = timeFormatter.format(now);
            const timeEl = document.getElementById("nav-time");
            if (timeEl) timeEl.textContent = timeStr;

            const ld = new Date(now.toLocaleString('en-US', { timeZone: tz }));
            const days = ['日', '月', '火', '水', '木', '金', '土'];
            const dateStr = `${ld.getFullYear()}年${ld.getMonth() + 1}月${ld.getDate()}日 （${days[ld.getDay()]}）`;
            
            const dateEl = document.getElementById("nav-date");
            if (dateEl) dateEl.textContent = dateStr;
        } catch (e) {
            console.warn("Clock error:", e);
        }
    };
    updateHeaderClock();
    setInterval(updateHeaderClock, 1000);
}

export function switchToGateway() {
    if (state.unsubscribeCards) {
        state.unsubscribeCards();
        state.unsubscribeCards = null;
    }
    
    localStorage.removeItem("machikoto_current_user");

    if (window.location.search) {
        window.history.pushState({}, document.title, window.location.pathname);
    }

    state.currentUser = null;
    state.activeBoardUserId = null;
    state.isManager = false;
    state.isReadOnly = false;
    state.cards = [];

    // Clear the previous user's wallpaper so it never carries over to the next account
    resetWallpaper();

    // render() also removes the viewer-mode class from <body>
    render();

    const gatewayScreen = document.getElementById("gatewayScreen");
    const boardScreen = document.getElementById("boardScreen");
    if (gatewayScreen) gatewayScreen.classList.add("active");
    if (boardScreen) boardScreen.classList.remove("active");
}

export function switchToBoard() {
    const gatewayScreen = document.getElementById("gatewayScreen");
    const boardScreen = document.getElementById("boardScreen");
    if (gatewayScreen) gatewayScreen.classList.remove("active");
    if (boardScreen) boardScreen.classList.add("active");
    renderBoardInternal();
}

function renderBoardInternal() {
    import('./cards.js').then(module => {
        module.renderBoard();
    });
}

export function render() {
    // Viewer mode (share link): hides all tools and account buttons, only the phone remains
    document.body.classList.toggle("viewer-mode", state.isReadOnly && !state.isManager);

    const urlElem = document.getElementById("urlDisplay");
    const copyBtn = document.getElementById("copyShareBtn");
    const changeUserNameBtn = document.getElementById("changeUserNameBtn");
    const navUsernameElem = document.getElementById("nav-username");

    if (navUsernameElem) {
        navUsernameElem.textContent = (state.currentUser && state.currentUser.name) ? state.currentUser.name : "";
    }

    if (urlElem) {
        if (state.currentUser && state.isManager) {
            const docId = state.currentUser.docId;
            urlElem.textContent = `hiroba.japan-vi.be/index.html?board=${encodeURIComponent(docId)}`;
            if (copyBtn) copyBtn.style.display = "inline-flex";
            if (changeUserNameBtn) changeUserNameBtn.style.display = "inline-flex";
        } else if (state.isReadOnly) {
            urlElem.textContent = window.location.href;
            if (copyBtn) copyBtn.style.display = "none";
            if (changeUserNameBtn) changeUserNameBtn.style.display = "none";
        } else {
            urlElem.textContent = "hiroba.japan-vi.be/";
            if (copyBtn) copyBtn.style.display = "none";
            if (changeUserNameBtn) changeUserNameBtn.style.display = "none";
        }
    }

    const addCardBtn = document.getElementById("addCardBtn");
    const adminaccountActions = document.getElementById("adminaccountActions");
    const corkboard = document.getElementById("corkboard");

    if (addCardBtn && adminaccountActions && corkboard) {
        if (state.isManager) {
            addCardBtn.style.display = "inline-flex";
            adminaccountActions.style.display = "flex";
            corkboard.classList.remove("read-only");
        } else {
            addCardBtn.style.display = "none";
            adminaccountActions.style.display = "none";
            corkboard.classList.add("read-only");
        }
    }
}

export async function checkUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    const boardParam = urlParams.get('board');

    if (boardParam) {
        // Share link: read-only mode, even if a manager session exists in this browser
        state.isManager = false;
        state.isReadOnly = true;

        let resolvedUserId = boardParam;
        let managerName = boardParam;

        if (db) {
            try {
                const managerDoc = await getDoc(doc(db, "managers", boardParam));
                if (managerDoc.exists()) {
                    resolvedUserId = boardParam;
                    managerName = managerDoc.data().name || boardParam;
                }
            } catch (e) {
                console.warn("Manager load warning:", e);
            }
        } else {
            if (state.managers[boardParam]) {
                resolvedUserId = boardParam;
                managerName = state.managers[boardParam].name || boardParam;
            }
        }

        state.activeBoardUserId = resolvedUserId;
        state.currentUser = { docId: resolvedUserId, managerId: resolvedUserId, name: managerName };
        subscribeToRealtimeCards(resolvedUserId);
        render();
        switchToBoard();
        loadUserWallpaper(resolvedUserId);
    } else {
        render();
    }
}

export function copyShareLink() {
    const docId = state.currentUser?.docId;
    if (!docId) return;
    const url = `https://hiroba.japan-vi.be/index.html?board=${encodeURIComponent(docId)}`;
    navigator.clipboard.writeText(url).then(() => {
        alert("共有リンクをコピーしました！");
    }).catch(err => {
        console.error("Copy error:", err);
        alert("コピーに失敗しました。");
    });
}

export function escapeHtml(str) {
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
