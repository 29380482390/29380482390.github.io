function updateClock() {
  var now = new Date();
  hours = now.getHours();
  minutes = now.getMinutes();
  seconds = now.getSeconds();
  if (seconds < 10) {
    seconds_ = ":" + "0" + seconds;
  } else {
    seconds_ = ":" + seconds;
  }
  if (minutes < 10) {
    time = hours + ":" + "0" + minutes + seconds_;
  } else {
    time = hours + ":" + minutes + seconds_;
  }
  if (hours < 10) {
    time = "0" + time;
  }
  document.getElementById("time").innerHTML = time;
  setTimeout(updateClock, 1000);
}

function updateDate() {
  const d = new Date();
  document.getElementById("date").innerHTML = d.toDateString();
}

function getLanguage() {
  var lang = navigator.language;

  document.getElementById("lang").innerHTML = lang;
}

updateClock();
updateDate();
getLanguage();