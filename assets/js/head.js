document.documentElement.classList.replace("no-js", "js");

try {
  if (localStorage.getItem("mutuara-theme") === "light") {
    document.documentElement.setAttribute("data-theme", "light");
  }
} catch (e) {}