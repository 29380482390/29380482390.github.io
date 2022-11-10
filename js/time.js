window.onload = displayClock();
function displayClock() {
  var d = new Date();
  var min = (mins = ('0' + d.getMinutes()).slice(-2));
  var hh = d.getHours();
  var ss = (mins = ('0' + d.getSeconds()).slice(-2));

  document.getElementById('hour').innerText = hh;
  document.getElementById('minutes').innerText = min;
  document.getElementById('seconds').innerText = ss;

  setTimeout(displayClock, 1000);
}
