import { state, saveLocalManagers } from './state.js';
import { db } from './firebase.js';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { subscribeToRealtimeCards } from './cards.js';
import { render, switchToGateway, switchToBoard } from './ui.js';
import { loadUserWallpaper } from './wallpaper.js';

export async function handleRegister(e) {
    e.preventDefault();
    const customId = document.getElementById("regId").value.trim();
    const password = document.getElementById("regPassword").value.trim();
    const name = document.getElementById("regName").value.trim();

    if (!customId || !password || !name) return;

    if (customId.length < 4 || password.length < 6) {
        alert("IDは4文字以上、パスワードは6文字以上で入力してください。");
        return;
    }

    const recoveryCode = String(Math.floor(100000 + Math.random() * 900000));
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let randomUid = '';
    for (let i = 0; i < 10; i++) {
        randomUid += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    try {
        if (db) {
            const managerDocRef = doc(db, "managers", randomUid);
            await setDoc(managerDocRef, {
                loginId: customId,
                password: password,
                name: name,
                recoveryCode: recoveryCode,
                createdAt: new Date()
            });
        } else {
            if (state.managers[customId]) {
                alert("この管理IDは既に使用されています。");
                return;
            }
            state.managers[randomUid] = {
                loginId: customId,
                password: password,
                name: name,
                recoveryCode: recoveryCode
            };
            saveLocalManagers();
        }

        alert("ご登録いただき、誠にありがとうございます。\n\n【重要】パスワード再設定用の6桁コードです:\n" + recoveryCode + "\n\n必ずメモするか写真を撮って保管してください。");

        document.getElementById("regId").value = "";
        document.getElementById("regPassword").value = "";
        document.getElementById("regName").value = "";

        toggleRegisterView(false);
        switchToGateway();
    } catch (error) {
        console.error("Registration error:", error);
        alert("登録処理中にエラーが発生いたしました。");
    }
}

export async function handleLogin(e) {
    e.preventDefault();
    const loginIdInput = document.getElementById("loginId").value.trim();
    const password = document.getElementById("loginPassword").value.trim();

    if (loginIdInput.length < 4 || password.length < 6) {
        alert("IDは4文字以上、パスワードは6文字以上で入力してください。");
        return;
    }

    try {
        let managerData = null;

        if (db) {
            const q = query(collection(db, "managers"), where("loginId", "==", loginIdInput));
            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                const docRef = doc(db, "managers", loginIdInput);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists() && docSnap.data().password === password) {
                    const data = docSnap.data();
                    managerData = { docId: docSnap.id, managerId: docSnap.id, name: data.name };
                } else {
                    alert("IDまたはパスワードが間違っています。");
                    return;
                }
            } else {
                const docSnap = querySnapshot.docs[0];
                const data = docSnap.data();
                if (data.password !== password) {
                    alert("IDまたはパスワードが間違っています。");
                    return;
                }
                managerData = { docId: docSnap.id, managerId: docSnap.id, name: data.name };
            }
        } else {
            let foundUid = null;
            let foundData = null;
            for (const [uid, data] of Object.entries(state.managers)) {
                if (data.loginId === loginIdInput || uid === loginIdInput) {
                    foundUid = uid;
                    foundData = data;
                    break;
                }
            }
            if (!foundData || foundData.password !== password) {
                alert("IDまたはパスワードが間違っています。");
                return;
            }
            managerData = { docId: foundUid, managerId: foundUid, name: foundData.name };
        }

        state.currentUser = managerData;
        state.activeBoardUserId = managerData.docId;
        state.isManager = true;
        state.isReadOnly = false;
        
        localStorage.setItem("machikoto_current_user", JSON.stringify(managerData));

        subscribeToRealtimeCards(managerData.docId);
        render();
        switchToBoard();
        loadUserWallpaper(managerData.docId);

    } catch (error) {
        console.error("Login error:", error);
        alert("ログイン処理中にエラーが発生いたしました。");
    }
}

export async function handleResetPassword(e) {
    e.preventDefault();
    const loginIdInput = document.getElementById("resetId").value.trim();
    const code = document.getElementById("resetCode").value.trim();
    const newPassword = document.getElementById("resetNewPassword").value.trim();

    if (!loginIdInput || !code || !newPassword || newPassword.length < 6) {
        alert("新しいパスワードは6文字以上で入力してください。");
        return;
    }

    try {
        if (db) {
            const q = query(collection(db, "managers"), where("loginId", "==", loginIdInput));
            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                alert("指定されたIDが見つかりません。");
                return;
            }

            const docSnap = querySnapshot.docs[0];
            const data = docSnap.data();
            if (data.recoveryCode !== code) {
                alert("6桁のコードが正しくありません。");
                return;
            }

            await updateDoc(doc(db, "managers", docSnap.id), { password: newPassword });
        } else {
            let foundUid = null;
            for (const [uid, data] of Object.entries(state.managers)) {
                if (data.loginId === loginIdInput || uid === loginIdInput) {
                    foundUid = uid;
                    break;
                }
            }
            if (!foundUid || state.managers[foundUid].recoveryCode !== code) {
                alert("IDまたは6桁のコードが正しくありません。");
                return;
            }
            state.managers[foundUid].password = newPassword;
            saveLocalManagers();
        }

        alert("パスワードが正常に更新されました。");
        document.getElementById("resetId").value = "";
        document.getElementById("resetCode").value = "";
        document.getElementById("resetNewPassword").value = "";
        toggleResetView(false);
    } catch (error) {
        console.error("Password reset error:", error);
        alert("パスワード再設定中にエラーが発生いたしました。");
    }
}

export function openUserNameModal() {
    if (!state.isManager) return;
    const input = document.getElementById("newUserName");
    if (input) input.value = state.currentUser.name || "";
    const modal = document.getElementById("userNameModal");
    if (modal) modal.classList.add("active");
}

export function closeUserNameModal() {
    const modal = document.getElementById("userNameModal");
    if (modal) modal.classList.remove("active");
}

export async function handleSaveUserName(e) {
    e.preventDefault();
    const newUserName = document.getElementById("newUserName").value.trim();
    if (!newUserName) return;

    try {
        if (db) {
            const managerDocRef = doc(db, "managers", state.currentUser.docId);
            await updateDoc(managerDocRef, { name: newUserName });
        } else {
            state.managers[state.currentUser.managerId].name = newUserName;
            saveLocalManagers();
        }

        state.currentUser.name = newUserName;
        const savedUser = localStorage.getItem("machikoto_current_user");
        if (savedUser) {
            const userData = JSON.parse(savedUser);
            userData.name = newUserName;
            localStorage.setItem("machikoto_current_user", JSON.stringify(userData));
        }

        render();
        closeUserNameModal();
        alert("ユーザー名が正常に更新されました。");
    } catch (error) {
        console.error("User name update error:", error);
        alert("ユーザー名の更新に失敗しました。");
    }
}

export async function deleteAccount() {
    if (!state.currentUser || !state.isManager) return;

    if (confirm("アカウントを削除して初期画面に戻りますか？")) {
        try {
            if (db) {
                const promises = state.cards.map(c => 
                    deleteDoc(doc(db, "managers", state.currentUser.docId, "posts", c.id))
                );
                await Promise.all(promises);
                await deleteDoc(doc(db, "managers", state.currentUser.docId));
            } else {
                delete state.managers[state.currentUser.managerId];
                saveLocalManagers();
                localStorage.removeItem(`machikoto_cards_${state.currentUser.managerId}`);
            }
            localStorage.removeItem("machikoto_current_user");
            switchToGateway();
        } catch (error) {
            console.error("Delete account error:", error);
            alert("アカウント削除に失敗いたしました。");
        }
    }
}

export function toggleRegisterView(isRegister) {
    const loginBlock = document.getElementById("loginFormBlock");
    const registerBlock = document.getElementById("registerFormBlock");
    const resetBlock = document.getElementById("resetFormBlock");
    if (loginBlock && registerBlock && resetBlock) {
        loginBlock.style.display = isRegister ? "none" : "block";
        registerBlock.style.display = isRegister ? "block" : "none";
        resetBlock.style.display = "none";
    }
}

export function toggleResetView(isReset) {
    const loginBlock = document.getElementById("loginFormBlock");
    const registerBlock = document.getElementById("registerFormBlock");
    const resetBlock = document.getElementById("resetFormBlock");
    if (loginBlock && registerBlock && resetBlock) {
        loginBlock.style.display = isReset ? "none" : "block";
        registerBlock.style.display = "none";
        resetBlock.style.display = isReset ? "block" : "none";
    }
}
