function loadModule(name) {
  fetch(`../modules/${name}/index.html`)
    .then((res) => res.text())
    .then((html) => {
      document.getElementById("content").innerHTML = html;

      const script = document.createElement("script");
      script.src = `../modules/${name}/script.js`;
      document.body.appendChild(script);
    });
}

function openModule1() {
  window.location.href = "../../modules/module1-archive/index.html";
}
