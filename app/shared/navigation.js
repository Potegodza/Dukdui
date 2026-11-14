const navigation = document.querySelector("[data-app-navigation]");

if (navigation) {
  const isRandomPage = location.pathname === "/random-discussions.html"
    || location.pathname === "/randomchat.html";
  const isAppMounted = location.pathname.startsWith("/app/")
    || isRandomPage;
  const appPrefix = isAppMounted ? "/app" : "";
  const appOrigin = (window.DUKDUI_APP_ORIGIN
    || location.origin).replace(/\/+$/, "");
  const randomOrigin = (window.DUKDUI_RANDOM_ORIGIN
    || location.origin).replace(/\/+$/, "");
  const routes = {
    home: `${appOrigin}${appPrefix}/home/homepage.html`,
    chat: `${appOrigin}${appPrefix}/private-chat/chat.html`,
    random: `${randomOrigin}/random-discussions.html`,
    account: `${appOrigin}${appPrefix}/account/account.html`
  };
  const activePage = navigation.dataset.activePage;
  const items = [
    ["home", "หน้าแรก", "house"],
    ["chat", "แชทส่วนตัว", "message-square"],
    ["random", "สุ่มคุย", "users-round"],
    ["account", "บัญชีของฉัน", "user-round"]
  ];

  navigation.className = "app-sidebar";
  const brand = document.createElement("a");
  brand.className = "app-brand";
  brand.href = routes.home;
  brand.textContent = "Dukdui ";
  const brandSuffix = document.createElement("span");
  brandSuffix.textContent = "SPU";
  brand.append(brandSuffix);

  const menu = document.createElement("nav");
  menu.className = "app-navigation";
  menu.setAttribute("aria-label", "เมนูหลัก");
  for (const [page, label, iconName] of items) {
    const link = document.createElement("a");
    link.className = `app-nav-link${page === activePage ? " active" : ""}`;
    link.href = routes[page];
    if (page === activePage) link.setAttribute("aria-current", "page");

    const icon = document.createElement("i");
    icon.dataset.lucide = iconName;
    icon.setAttribute("aria-hidden", "true");
    const text = document.createElement("span");
    text.textContent = label;
    link.append(icon, text);
    menu.append(link);
  }

  const profile = document.createElement("div");
  profile.className = "app-nav-profile";
  const avatar = document.createElement("div");
  avatar.className = "app-nav-avatar";
  avatar.setAttribute("aria-hidden", "true");
  const profileInfo = document.createElement("div");
  profileInfo.className = "app-nav-profile-info";
  const userName = document.createElement("span");
  userName.id = "userName";
  userName.dataset.userName = "";
  userName.textContent = window.currentUser?.uid || "ผู้ใช้";
  const status = document.createElement("small");
  status.textContent = "บัญชี Dukdui";
  profileInfo.append(userName, status);
  profile.append(avatar, profileInfo);

  if (activePage === "home") {
    const signOutButton = document.createElement("button");
    signOutButton.className = "app-nav-signout";
    signOutButton.type = "button";
    signOutButton.dataset.signOut = "";
    signOutButton.textContent = "ออกจากระบบ";
    profile.append(signOutButton);
  }

  navigation.replaceChildren(brand, menu, profile);
  document.querySelectorAll("[data-app-link]").forEach((link) => {
    const route = routes[link.dataset.appLink];
    if (route) link.href = route;
  });

  if (window.lucide) window.lucide.createIcons();
}
