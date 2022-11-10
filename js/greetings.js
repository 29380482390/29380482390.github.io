var myDate = new Date();
var hrs = myDate.getHours();

var greet;

if (hrs < 12)
    greet = 'おはよう~ ( ･ω･)ﾉ';
else if (hrs >= 12 && hrs <= 17)
    greet = 'ひぃ (*´∇｀)ﾉ';
else if (hrs >= 17 && hrs <= 24)
    greet = 'おやすみ (。＿ ＿)';

document.getElementById('greeting').innerHTML = greet;