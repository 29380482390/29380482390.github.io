window.onload = displayClock();
function displayClock() {
  var d = new Date();
  var min = (mins = ('0' + d.getMinutes()).slice(-2));
  var hh = d.getHours();
  var ss = (mins = ('0' + d.getSeconds()).slice(-2));
  dd = (mins = ('0' + d.getDate()).slice(-2));
  mm = (mins = ('0' + d.getMonth()).slice(-2));
  yy = d.getFullYear();
  document.getElementById('time').innerText = "[" + hh + ":" + min + ":" + ss + "]" ;
  document.getElementById('date').innerText = "[" + dd + "/" + mm + "/" + yy + "]" ;
  setTimeout(displayClock, 1000);
}