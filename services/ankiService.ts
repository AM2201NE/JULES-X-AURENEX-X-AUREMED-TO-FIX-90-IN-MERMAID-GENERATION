import initSqlJs from 'sql.js';
import JSZip from 'jszip';
import type { AnkiCard } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { sanitizeMermaidCode } from '../lib/mermaidUtils';

// NEW MODEL DEFINITION BASED ON ASHRAF NABIL'S TEMPLATE
const ASHRAF_MCQ_MODEL_NAME = "MCQ by Ashraf Nabil";
const ASHRAF_MCQ_MODEL_FIELDS = [
    { name: 'Question' },
    { name: 'option_1 (A)' }, { name: 'option_2 (B)' },
    { name: 'option_3 (C)' }, { name: 'option_4 (D)' },
    { name: 'option_5 (E)' }, { name: 'option_6 (F)' },
    { name: 'option_7 (G)' }, { name: 'option_8 (H)' },
    { name: 'Ans' },
    { name: 'Explanation' },
];

const ASHRAF_MCQ_FRONT_TEMPLATE = `<!---------
made by Ashraf Nabil
ashraf.nabil132@gmail.com
01064619425
--------------->
<script src="https://ajax.googleapis.com/ajax/libs/jquery/3.5.1/jquery.min.js"></script>
<div id="myCard">
  <div class="front">
  <div style='font-family:"Arial";font-size:25px;font-weight:bold'>{{Question}}</div>
  {{#Image}}<div style="text-align:center; margin: 10px 0;">{{Image}}</div>{{/Image}}
  <br>
  <form id="shuffle">
    {{#option_1 (A)}}<div class="container" id="A"><input type="checkbox" name="radAnswer" class="checkbox" id="A"><div class="option">{{option_1 (A)}}</div></div>{{/option_1 (A)}}
    {{#option_2 (B)}}<div class="container" id="B"><input type="checkbox" name="radAnswer" class="checkbox" id="B"><div class="option">{{option_2 (B)}}</div></div>{{/option_2 (B)}}
    {{#option_3 (C)}}<div class="container" id="C"><input type="checkbox" name="radAnswer" class="checkbox" id="C"><div class="option">{{option_3 (C)}}</div></div>{{/option_3 (C)}}
    {{#option_4 (D)}}<div class="container" id="D"><input type="checkbox" name="radAnswer" class="checkbox" id="D"><div class="option">{{option_4 (D)}}</div></div>{{/option_4 (D)}}
    {{#option_5 (E)}}<div class="container" id="E"><input type="checkbox" name="radAnswer" class="checkbox" id="E"><div class="option">{{option_5 (E)}}</div></div>{{/option_5 (E)}}
    {{#option_6 (F)}}<div class="container" id="F"><input type="checkbox" name="radAnswer" class="checkbox" id="F"><div class="option">{{option_6 (F)}}</div></div>{{/option_6 (F)}}
    {{#option_7 (G)}}<div class="container" id="G"><input type="checkbox" name="radAnswer" class="checkbox" id="G"><div class="option">{{option_7 (G)}}</div></div>{{/option_7 (G)}}
    {{#option_8 (H)}}<div class="container" id="H"><input type="checkbox" name="radAnswer" class="checkbox" id="H"><div class="option">{{option_8 (H)}}</div></div>{{/option_8 (H)}}
  </form>
  </div>
  <div id="settings">
    <div id="gear">
      <svg width="50px" height="50px" viewBox="0 0 48 48" version="1" xmlns="http://www.w3.org/2000/svg" enable-background="new 0 0 48 48"><path fill="#607D8B" d="M39.6,27.2c0.1-0.7,0.2-1.4,0.2-2.2s-0.1-1.5-0.2-2.2l4.5-3.2c0.4-0.3,0.6-0.9,0.3-1.4L40,10.8 c-0.3-0.5-0.8-0.7-1.3-0.4l-5,2.3c-1.2-0.9-2.4-1.6-3.8-2.2l-0.5-5.5c-0.1-0.5-0.5-0.9-1-0.9h-8.6c-0.5,0-1,0.4-1,0.9l-0.5,5.5 c-1.4,0.6-2.7,1.3-3.8,2.2l-5-2.3c-0.5-0.2-1.1,0-1.3,0.4l4.3-7.4 c0.3-0.5,0.1-1.1-0.3-1.4L39.6,27.2z M24,35c-5.5,0-10-4.5-10-10c0-5.5,4.5-10,10-10c5.5,0,10,4.5,10,10C34,30.5,29.5,35,24,35z"/><path fill="#455A64" d="M24,13c-6.6,0-12,5.4-12,12c0,6.6,5.4,12,12,12s12-5.4,12-12C36,18.4,30.6,13,24,13z M24,30 c-2.8,0-5-2.2-5-5c0-2.8,2.2-5,5-5s5,2.2,5,5C29,27.8,26.8,30,24,30z"/></svg>
    </div>
    <div id="settings-content" style="display:none">
      <div id="zoom">
      <div id="positive">
        <svg width="50px" height="50px" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><title>70 Basic icons by Xicons.co</title><path d="M24,3A21,21,0,1,0,45,24,21,21,0,0,0,24,3Z" fill="#afe0f5"/><path d="M32,26H16a2,2,0,0,1,0-4H32A2,2,0,0,1,32,26Z" fill="#38b1e7"/><path d="M24,34a2,2,0,0,1-2-2V16a2,2,0,0,1,4,0V32A2,2,0,0,1,24,34Z" fill="#38b1e7"/></svg>
      </div>
      <div id="default">
        <svg width="50px" height="50px" version="1.1" viewBox="0 0 496.17 496.17" xml:space="preserve" xmlns="http://www.w3.org/2000/svg"><path d="m5e-3 248.09c0-137.02 111.07-248.09 248.07-248.09 137.01 0 248.08 111.06 248.08 248.09 0 137-111.07 248.08-248.08 248.08-137.01 0-248.07-111.08-248.07-248.08z" fill="#32BEA6"/><path d="m400.81 169.58c-2.502-4.865-14.695-16.012-35.262-5.891-20.564 10.122-10.625 32.351-10.625 32.351 7.666 15.722 11.98 33.371 11.98 52.046 0 65.622-53.201 118.82-118.83 118.82-65.619 0-118.82-53.202-118.82-118.82 0-61.422 46.6-111.95 106.36-118.17v30.793s-0.084 1.836 1.828 2.999c1.906 1.163 3.818 0 3.818 0l98.576-58.083s2.211-1.162 2.211-3.436c0-1.873-2.211-3.205-2.211-3.205l-98.248-57.754s-2.24-1.605-4.23-0.826c-1.988 0.773-1.744 3.481-1.744 3.481v32.993c-88.998 6.392-159.23 80.563-159.23 171.21 0 94.824 76.873 171.7 171.69 171.7 94.828 0 171.71-76.872 171.71-171.7 1e-3 -28.298-6.852-54.98-18.972-78.505z" fill="#F7F7F7"/></svg>
      </div>
      <div id="negative">
        <svg width="50px" height="50px" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><title>70 Basic icons by Xicons.co</title><path d="M24,3A21,21,0,1,0,45,24,21,21,0,0,0,24,3Z" fill="#f8bcc4"/><path d="M32,26H16a2,2,0,0,1,0-4H32A2,2,0,0,1,32,26Z" fill="#ee586c"/></svg>
      </div>
    </div>
    <div id="switch">
      <div class="check-box">
        <label for="Auto_submit"><div>Auto submit</div><div style="font-size: .7em; text-align:center;">(in only answer)</div></label>

        <input id="Auto_submit" type="checkbox" checked>
      </div>
      <div class="check-box">
        <label for="Shuffling">Shuffling</label>
        <input id="Shuffling" type="checkbox">
      </div>
    </div>
    </div>
  </div>
</div>
<script>
//--------------------------persistance
if(void 0===window.Persistence){var e="github.com/SimonLammer/anki-persistence/",t="_default";if(window.Persistence_sessionStorage=function(){var i=!1;try{"object"==typeof window.sessionStorage&&(i=!0,this.clear=function(){for(var t=0;t<sessionStorage.length;t++){var i=sessionStorage.key(t);0==i.indexOf(e)&&(sessionStorage.removeItem(i),t--)}},this.setItem=function(i,n){void 0==n&&(n=i,i=t),sessionStorage.setItem(e+i,JSON.stringify(n))},this.getItem=function(i){return void 0==i&&(i=t),JSON.parse(sessionStorage.getItem(e+i))},this.removeItem=function(i){void 0==i&&(i=t),sessionStorage.removeItem(e+i)},this.getAllKeys=function(){for(var t=[],i=Object.keys(sessionStorage),n=0;n<i.length;n++){var s=i[n];0==s.indexOf(e)&&t.push(s.substring(e.length,s.length))}return t.sort()})}catch(n){}this.isAvailable=function(){return i}},window.Persistence_windowKey=function(i){var n=window[i],s=!1;"object"==typeof n&&(s=!0,this.clear=function(){n[e]={}},this.setItem=function(i,s){void 0==s&&(s=i,i=t),n[e][i]=s},this.getItem=function(i){return void 0==i&&(i=t),void 0==n[e][i]?null:n[e][i]},this.removeItem=function(i){void 0==i&&(i=t),delete n[e][i]},this.getAllKeys=function(){return Object.keys(n[e])},void 0==n[e]&&this.clear()),this.isAvailable=function(){return s}},window.Persistence=new Persistence_sessionStorage,Persistence.isAvailable()||(window.Persistence=new Persistence_windowKey("py")),!Persistence.isAvailable()){var i=window.location.toString().indexOf("title"),n=window.location.toString().indexOf("main",i);i>0&&n>0&&n-i<10&&(window.Persistence=new Persistence_windowKey("qt"))}}
//---------------------------variables
var X = "{{Ans}}";
if (X == X.toLowerCase()) {
  var X = X.toUpperCase()
}
var Y = Number(X);
var k = "value";
var answer =""
var checkbox = document.getElementsByTagName("input");
var option = document.getElementsByClassName("option");
var container = document.getElementsByClassName("container");
var DefElems = document.querySelectorAll('#shuffle > div');
Persistence.setItem("scroll", 0)
Persistence.setItem("answer", "")

//---------------------------------remove empty elements
var divs = document.querySelectorAll('.option');
  divs.forEach(div => {
    if (div.innerHTML === '') {
      div.parentNode.remove();
    }
});
//------------------------------------zoom
if(Persistence.getItem("Zoom")==null){
  Persistence.setItem("Zoom", 1)
}
var zoom = Persistence.getItem("Zoom");
$('.front').css('zoom', zoom);

$('#positive').on('click', function(){
  zoom += 0.1;
  Persistence.setItem("Zoom", zoom)
  $('.front').css('zoom', zoom);
});
$('#default').on('click', function(){
  zoom = 1;
  Persistence.setItem("Zoom", zoom)
  $('.front').css('zoom', zoom);
});
$('#negative').on('click', function(){
  zoom -= 0.1;
  Persistence.setItem("Zoom", zoom)
  $('.front').css('zoom', zoom);
});
$('#gear').on('click', function(){
  $('#settings-content').toggle(50);
  setTimeout(
  function() 
  {
    $('#myCard').scrollTop($('#myCard')[0].scrollHeight);
  }, 100)
  
  
})

//-------------------------------------functions
document.getElementById("myCard").onscroll = function(){
  var scrollPosition=document.getElementById("myCard").scrollTop
  Persistence.setItem("scroll", scrollPosition)
};

function ToggleCheck() {
var mycheckBox = $("input[type='checkbox']#"+this.id);
var cont = $(".container#"+this.id);
mycheckBox.attr("checked", !mycheckBox.attr("checked"));
console.log(cont)
cont.toggleClass("check")
}

// function storeAnswer() {
//   var a = this.id;
//   Persistence.setItem("answer",a);
//   console.log(a)
// }
function storeAnswerBox() {
  answer=""
for (var i=0, iLen=option.length; i<iLen; i++) {
    if (checkbox[i].checked) {
      
      answer=answer+checkbox[i].id;
    }
  }
  Persistence.setItem("answer",answer);
  console.log(answer)

}

function flipToBack() {

 setTimeout(function() {

if (typeof pycmd !== "undefined") {
      pycmd("ans")
    } else {
      if (typeof study !== "undefined") {
        study.drawAnswer()
      } else {
        if (typeof AnkiDroidJS !== "undefined") {
          showAnswer()
        } else {
          if (window.anki && window.sendMessage2) {
            window.sendMessage2("ankitap", "midCenter")
          }
        }
      }
    }
  

 }, 50)}
  
function shuffle(elems) {
  allElems = (function() {
    var ret = [],
      l = elems.length;
    while (l--) {
      ret[ret.length] = elems[l];
    }
    return ret;
  })();
  var shuffled = (function() {
      var l = allElems.length,
        ret = [];
      while (l--) {
        var random = Math.floor(Math.random() * allElems.length),
          randEl = allElems[random].cloneNode(true);
        allElems.splice(random, 1);
        ret[ret.length] = randEl;
        Persistence.setItem("order"+l,random);
        console.log(random);
      }
      return ret;
    })(),
    l = elems.length;
  while (l--) {
    elems[l].parentNode.insertBefore(shuffled[l], elems[l].nextSibling);
    elems[l].parentNode.removeChild(elems[l]);
  }
  
}

function reverseShuffle(elems) {
  allElems = (function() {
    
    var ret = [],
      l = DefElems.length;
    while (l--) {
      ret[ret.length] = DefElems[l];
    }
    return ret;
    
  })();
  console.log(allElems)
  
 var shuffled = (function() {
      var l = allElems.length,
        ret = [];
      while (l--) {
        var random = l,
          randEl = allElems[random].cloneNode(true);
        allElems.splice(random, 1);
        ret[ret.length] = randEl;
        Persistence.setItem("order"+l,random);
        console.log(random);
      }
      return ret;
    })(),
    l = elems.length;
  while (l--) {
    elems[l].parentNode.insertBefore(shuffled[l], elems[l].nextSibling);
    elems[l].parentNode.removeChild(elems[l]);
  }
}

function HandleShufflingBox(){
  Persistence.setItem("ShufflingBox", $("#Shuffling").is(":checked"));
  if($("#Shuffling").is(":checked")){
    shuffle(document.querySelectorAll('#shuffle > div'));
    $(".Letters").remove();
    HandelEvents();
  }else{
    reverseShuffle(document.querySelectorAll('#shuffle > div'));
    HandelEvents();
  }

}

function HandleSubmitBox(){
  Persistence.setItem("SubmitBox", $("#Auto_submit").is(":checked"));
  if($("#Auto_submit").is(":checked") && X.length==1){
    for (i = 0; i < container.length; i++) {
    container[i].addEventListener("click", flipToBack);
    }
  }else{
    for (i = 0; i < container.length; i++) {
    container[i].removeEventListener("click", flipToBack);
    }
  }

}
//------------------------------------------------

if( Persistence.getItem("SubmitBox")==null || Persistence.getItem("ShufflingBox") ==null){
  Persistence.setItem("SubmitBox", true);
  Persistence.setItem("ShufflingBox", false);
};

  for (i = 1; i < container.length+1; i++) {
  $(".container:nth-of-type("+i+") .option").prepend("<span class='Letters'>("+String.fromCharCode(64+i)+")&nbsp;</span>");
  
  }

document.querySelector("#Shuffling").addEventListener("click",HandleShufflingBox)
$("#Shuffling").prop("checked", Persistence.getItem("ShufflingBox"));

document.querySelector("#Auto_submit").addEventListener("click",HandleSubmitBox)
$("#Auto_submit").prop("checked", Persistence.getItem("SubmitBox"));

if($("#Shuffling").is(":checked")){
  shuffle(document.querySelectorAll('#shuffle > div'));
  $(".Letters").remove();
}else{
}

function HandelEvents(){

if(X.length==1  && $("#Auto_submit").is(":checked")){
  for (i = 0; i < container.length; i++) {
    container[i].addEventListener("click", ToggleCheck);
    container[i].addEventListener("click", storeAnswerBox);
    container[i].addEventListener("click", flipToBack);
  }

}else{
  for (i = 0; i < container.length; i++) {
    container[i].addEventListener("click", ToggleCheck);
    container[i].addEventListener("click", storeAnswerBox);
  }

}

}
HandelEvents();

/*  for (i = 0; i < container.length; i++) {
    container[i].addEventListener("click", storeAnswer);
    container[i].addEventListener("click", flipToBack);
  };*/
function deselect(){
  $(this).replaceWith(this.innerHTML)
  $(".highlighted").click(deselect)
}

$(document).on("mouseup", function (e) {
    var selected = window.getSelection();
    var range = selected.getRangeAt(0);
    if(selected.toString().length > 0){
        var newNode = document.createElement("span");
        newNode.setAttribute("class", "highlighted");
        newNode.addEventListener("click", deselect)
        range.surroundContents(newNode); 

    }

    
 });
</script>`;

const ASHRAF_MCQ_BACK_TEMPLATE = `<!---------
made by Ashraf Nabil
ashraf.nabil132@gmail.com
01064619425
--------------->
<script src="https://ajax.googleapis.com/ajax/libs/jquery/3.5.1/jquery.min.js"></script>
<div id="myCard">
  <div class="back">
    <div style='font-family: "Arial"; font-size: 25px;'></div>
    <div style='font-family: "Arial";  font-size: 25px;font-weight:bold;'>{{Question}}</div><br>
    <form id="shuffle">
    {{#option_1 (A)}}<div class="container" id="A"><div class="circle"></div><div  class="option">{{option_1 (A)}}</div></div>{{/option_1 (A)}}
    {{#option_2 (B)}}<div class="container" id="B"><div class="circle"></div><div  class="option">{{option_2 (B)}}</div></div>{{/option_2 (B)}}
    {{#option_3 (C)}}<div class="container" id="C"><div class="circle"></div><div  class="option">{{option_3 (C)}}</div></div>{{/option_3 (C)}}
    {{#option_4 (D)}}<div class="container" id="D"><div class="circle"></div><div  class="option">{{option_4 (D)}}</div></div>{{/option_4 (D)}}
    {{#option_5 (E)}}<div class="container" id="E"><div class="circle"></div><div  class="option">{{option_5 (E)}}</div></div>{{/option_5 (E)}}
    {{#option_6 (F)}}<div class="container" id="F"><div class="circle"></div><div  class="option">{{option_6 (F)}}</div></div>{{/option_6 (F)}}
    {{#option_7 (G)}}<div class="container" id="G"><div class="circle"></div><div  class="option">{{option_7 (G)}}</div></div>{{/option_7 (G)}}
    {{#option_8 (H)}}<div class="container" id="H"><div class="circle"></div><div  class="option">{{option_8 (H)}}</div></div>{{/option_8 (H)}}
    </form>
    <div id="extra-section">
              <div id="extra-header" class="header header-yellow" onclick="$('#extra').toggle(100)">
                  Explanation
              </div>
              <div id="extra" class="content">
                  <div>{{Explanation}}</div>
              </div>
    </div>
  
</div>
  <div id="settings">
    <div id="gear">
      <svg width="50px" height="50px" viewBox="0 0 48 48" version="1" xmlns="http://www.w3.org/2000/svg" enable-background="new 0 0 48 48"><path fill="#607D8B" d="M39.6,27.2c0.1-0.7,0.2-1.4,0.2-2.2s-0.1-1.5-0.2-2.2l4.5-3.2c0.4-0.3,0.6-0.9,0.3-1.4L40,10.8 c-0.3-0.5-0.8-0.7-1.3-0.4l-5,2.3c-1.2-0.9-2.4-1.6-3.8-2.2l-0.5-5.5c-0.1-0.5-0.5-0.9-1-0.9h-8.6c-0.5,0-1,0.4-1,0.9l-0.5,5.5 c-1.4,0.6-2.7,1.3-3.8,2.2l-5-2.3c-0.5-0.2-1.1,0-1.3,0.4l4.3-7.4 c0.3-0.5,0.1-1.1-0.3-1.4L39.6,27.2z M24,35c-5.5,0-10-4.5-10-10c0-5.5,4.5-10,10-10c5.5,0,10,4.5,10,10C34,30.5,29.5,35,24,35z"/><path fill="#455A64" d="M24,13c-6.6,0-12,5.4-12,12c0,6.6,5.4,12,12,12s12-5.4,12-12C36,18.4,30.6,13,24,13z M24,30 c-2.8,0-5-2.2-5-5c0-2.8,2.2-5,5-5s5,2.2,5,5C29,27.8,26.8,30,24,30z"/></svg>
    </div>
    <div id="settings-content" style="display:none">
      <div id="zoom">
      <div id="positive">
        <svg width="50px" height="50px" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><title>70 Basic icons by Xicons.co</title><path d="M24,3A21,21,0,1,0,45,24,21,21,0,0,0,24,3Z" fill="#afe0f5"/><path d="M32,26H16a2,2,0,0,1,0-4H32A2,2,0,0,1,32,26Z" fill="#38b1e7"/><path d="M24,34a2,2,0,0,1-2-2V16a2,2,0,0,1,4,0V32A2,2,0,0,1,24,34Z" fill="#38b1e7"/></svg>
      </div>
      <div id="default">
        <svg width="50px" height="50px" version="1.1" viewBox="0 0 496.17 496.17" xml:space="preserve" xmlns="http://www.w3.org/2000/svg"><path d="m5e-3 248.09c0-137.02 111.07-248.09 248.07-248.09 137.01 0 248.08 111.06 248.08 248.09 0 137-111.07 248.08-248.08 248.08-137.01 0-248.07-111.08-248.07-248.08z" fill="#32BEA6"/><path d="m400.81 169.58c-2.502-4.865-14.695-16.012-35.262-5.891-20.564 10.122-10.625 32.351-10.625 32.351 7.666 15.722 11.98 33.371 11.98 52.046 0 65.622-53.201 118.82-118.83 118.82-65.619 0-118.82-53.202-118.82-118.82 0-61.422 46.6-111.95 106.36-118.17v30.793s-0.084 1.836 1.828 2.999c1.906 1.163 3.818 0 3.818 0l98.576-58.083s2.211-1.162 2.211-3.436c0-1.873-2.211-3.205-2.211-3.205l-98.248-57.754s-2.24-1.605-4.23-0.826c-1.988 0.773-1.744 3.481-1.744 3.481v32.993c-88.998 6.392-159.23 80.563-159.23 171.21 0 94.824 76.873 171.7 171.69 171.7 94.828 0 171.71-76.872 171.71-171.7 1e-3 -28.298-6.852-54.98-18.972-78.505z" fill="#F7F7F7"/></svg>
      </div>
      <div id="negative">
        <svg width="50px" height="50px" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><title>70 Basic icons by Xicons.co</title><path d="M24,3A21,21,0,1,0,45,24,21,21,0,0,0,24,3Z" fill="#f8bcc4"/><path d="M32,26H16a2,2,0,0,1,0-4H32A2,2,0,0,1,32,26Z" fill="#ee586c"/></svg>
      </div>
    </div>
      <div id="switch">
        <div class="check-box">
          <label for="Auto_submit"><div>Auto submit</div><div style="font-size: .7em; text-align:center;">(in only answer)</div></label>
          <input id="Auto_submit" type="checkbox" checked>
        </div>
        <div class="check-box">
          <label for="Shuffling">Shuffling</label>
          <input id="Shuffling" type="checkbox">
        </div>
      </div>
    </div>
  </div>
</div>

<script>
//-----------------------------------------------persistance
if(void 0===window.Persistence){var e="github.com/SimonLammer/anki-persistence/",t="_default";if(window.Persistence_sessionStorage=function(){var i=!1;try{"object"==typeof window.sessionStorage&&(i=!0,this.clear=function(){for(var t=0;t<sessionStorage.length;t++){var i=sessionStorage.key(t);0==i.indexOf(e)&&(sessionStorage.removeItem(i),t--)}},this.setItem=function(i,n){void 0==n&&(n=i,i=t),sessionStorage.setItem(e+i,JSON.stringify(n))},this.getItem=function(i){return void 0==i&&(i=t),JSON.parse(sessionStorage.getItem(e+i))},this.removeItem=function(i){void 0==i&&(i=t),sessionStorage.removeItem(e+i)},this.getAllKeys=function(){for(var t=[],i=Object.keys(sessionStorage),n=0;n<i.length;n++){var s=i[n];0==s.indexOf(e)&&t.push(s.substring(e.length,s.length))}return t.sort()})}catch(n){}this.isAvailable=function(){return i}},window.Persistence_windowKey=function(i){var n=window[i],s=!1;"object"==typeof n&&(s=!0,this.clear=function(){n[e]={}},this.setItem=function(i,s){void 0==s&&(s=i,i=t),n[e][i]=s},this.getItem=function(i){return void 0==i&&(i=t),void 0==n[e][i]?null:n[e][i]},this.removeItem=function(i){void 0==i&&(i=t),delete n[e][i]},this.getAllKeys=function(){return Object.keys(n[e])},void 0==n[e]&&this.clear()),this.isAvailable=function(){return s}},window.Persistence=new Persistence_sessionStorage,Persistence.isAvailable()||(window.Persistence=new Persistence_windowKey("py")),!Persistence.isAvailable()){var i=window.location.toString().indexOf("title"),n=window.location.toString().indexOf("main",i);i>0&&n>0&&n-i<10&&(window.Persistence=new Persistence_windowKey("qt"))}}

//-------------------------------------------------------------rmove empty fields
var divs = document.querySelectorAll('.option');
  divs.forEach(div => {
    if (div.innerHTML === '') {
      div.parentNode.remove();
    }
});
if ($('#extra>div').text() == ''){
$("#extra-header").hide();

}
//-----------------------------------------------varibales
document.getElementById("myCard").scrollTop = Persistence.getItem("scroll")
var answer = Persistence.getItem("answer");
console.log(answer);
var X = "{{Ans}}";
if (X == X.toLowerCase()) {
  var X = X.toUpperCase()
}
var Y = Number(X);
var k = "value";
var K1 ="valueC";
var accepted = "undifend";
var circle = document.getElementsByClassName("circle");
var option = document.getElementsByClassName("option");
var container = document.getElementsByClassName("container");
var divs = document.querySelectorAll('.option');
var TrueSVG = "<svg xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink' version='1.1' width='25' height='25' viewBox='0 0 256 256' xml:space='preserve'><defs></defs><g style='stroke: none; stroke-width: 0; stroke-dasharray: none; stroke-linecap: butt; stroke-linejoin: miter; stroke-miterlimit: 10; fill: none; fill-rule: nonzero; opacity: 1;' transform='translate(1.4065934065934016 1.4065934065934016) scale(2.81 2.81)' ><circle cx='45' cy='45' r='45' style='stroke: none; stroke-width: 1; stroke-dasharray: none; stroke-linecap: butt; stroke-linejoin: miter; stroke-miterlimit: 10; fill: rgb(5,152,98); fill-rule: nonzero; opacity: 1;' transform='  matrix(1 0 0 1 0 0) '/><path d='M 38.478 66 c -0.013 0 -0.026 0 -0.039 0 c -1.733 -0.012 -3.377 -0.771 -4.508 -2.085 L 20.453 48.263 c -2.162 -2.511 -1.879 -6.299 0.632 -8.462 c 2.51 -2.163 6.299 -1.879 8.462 0.632 l 8.991 10.441 l 21.967 -24.848 c 2.194 -2.485 5.988 -2.716 8.469 -0.521 c 2.483 2.195 2.717 5.986 0.521 8.469 l -26.522 30 C 41.834 65.263 40.197 66 38.478 66 z' style='stroke: none; stroke-width: 1; stroke-dasharray: none; stroke-linecap: butt; stroke-linejoin: miter; stroke-miterlimit: 10; fill: rgb(255,255,255); fill-rule: nonzero; opacity: 1;' transform=' matrix(1 0 0 1 0 0) ' stroke-linecap='round' /></g></svg>"
var FalseSVG = "<svg xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink' version='1.1' width='25' height='25' viewBox='0 0 256 256' xml:space='preserve'><defs></defs><g style='stroke: none; stroke-width: 0; stroke-dasharray: none; stroke-linecap: butt; stroke-linejoin: miter; stroke-miterlimit: 10; fill: none; fill-rule: nonzero; opacity: 1;' transform='translate(1.4065934065934016 1.4065934065934016) scale(2.81 2.81)' ><path d='M 45 90 C 20.187 90 0 69.813 0 45 C 0 20.187 20.187 0 45 0 c 24.813 0 45 20.187 45 45 C 90 69.813 69.813 90 45 90 z' style='stroke: none; stroke-width: 1; stroke-dasharray: none; stroke-linecap: butt; stroke-linejoin: miter; stroke-miterlimit: 10; fill: rgb(255, 89, 90); fill-rule: nonzero; opacity: 1;' transform=' matrix(1 0 0 1 0 0) ' stroke-linecap='round' /><path d='M 28.902 66.098 c -1.28 0 -2.559 -0.488 -3.536 -1.465 c -1.953 -1.952 -1.953 -5.118 0 -7.07 l 32.196 -32.196 c 1.951 -1.952 5.119 -1.952 7.07 0 c 1.953 1.953 1.953 5.119 0 7.071 L 32.438 64.633 C 31.461 65.609 30.182 66.098 28.902 66.098 z' style='stroke: none; stroke-width: 1; stroke-dasharray: none; stroke-linecap: butt; stroke-linejoin: miter; stroke-miterlimit: 10; fill: rgb(255,255,255); fill-rule: nonzero; opacity: 1;' transform=' matrix(1 0 0 1 0 0) ' stroke-linecap='round' /><path d='M 61.098 66.098 c -1.279 0 -2.56 -0.488 -3.535 -1.465 L 25.367 32.438 c -1.953 -1.953 -1.953 -5.119 0 -7.071 c 1.953 -1.952 5.118 -1.952 7.071 0 l 32.195 32.196 c 1.953 1.952 1.953 5.118 0 7.07 C 63.657 65.609 62.377 66.098 61.098 66.098 z' style='stroke: none; stroke-width: 1; stroke-dasharray: none; stroke-linecap: butt; stroke-linejoin: miter; stroke-miterlimit: 10; fill: rgb(255,255,255); fill-rule: nonzero; opacity: 1;' transform=' matrix(1 0 0 1 0 0) ' stroke-linecap='round' /></g></svg>"
//------------------------------------zoom
if(Persistence.getItem("Zoom")==null){
  Persistence.setItem("Zoom", 1)
}
var zoom = Persistence.getItem("Zoom");
$('.back').css('zoom', zoom);
$('#positive').on('click', function(){
  zoom += 0.1;
  Persistence.setItem("Zoom", zoom)
  $('.back').css('zoom', zoom);
});
$('#default').on('click', function(){
  zoom = 1;
  Persistence.setItem("Zoom", zoom)
  $('.back').css('zoom', zoom);
});
$('#negative').on('click', function(){
  zoom -= 0.1;
  Persistence.setItem("Zoom", zoom)
  $('.back').css('zoom', zoom);
});
$('#gear').on('click', function(){
  $('#settings-content').toggle(50);
  setTimeout(
  function() 
  {
    $('#myCard').scrollTop($('#myCard')[0].scrollHeight);
  }, 100)
  
  
})
//-------------------------------------------------------------functions
function shuffle(elems) {
    allElems = (function() {
      var ret = [],
        l = elems.length;
      while (l--) {
        ret[ret.length] = elems[l];
      }
      return ret;
    })();
    var shuffled = (function() {
        var l = allElems.length,
          ret = [];
        while (l--) {
          var random = Persistence.getItem("order"+l);
          var randEl = allElems[random].cloneNode(true);
          allElems.splice(random, 1);
          ret[ret.length] = randEl;
          console.log(random);
        }
        return ret;
      })(),
      l = elems.length;
    while (l--) {
      elems[l].parentNode.insertBefore(shuffled[l], elems[l].nextSibling);
      elems[l].parentNode.removeChild(elems[l]);
    }
}

function reverseShuffle(elems) {
  allElems = (function() {
    
    var ret = [],
      l = DefElems.length;
    while (l--) {
      ret[ret.length] = DefElems[l];
    }
    return ret;
    
  })();
  console.log(allElems)
  
 var shuffled = (function() {
      var l = allElems.length,
        ret = [];
      while (l--) {
        var random = l,
          randEl = allElems[random].cloneNode(true);
        allElems.splice(random, 1);
        ret[ret.length] = randEl;
        console.log(random);
      }
      return ret;
    })(),
    l = elems.length;
  while (l--) {
    elems[l].parentNode.insertBefore(shuffled[l], elems[l].nextSibling);
    elems[l].parentNode.removeChild(elems[l]);
  }
}

 

//-------------------------------------------------------------------------------------------
//select wrong answers
if(answer==null){
}
else {
for(i = 0; i < answer.length; i++) {
            console.log("first method");
            answers=answer.split('')[i]
            $("#"+answers+">.circle").append(FalseSVG)
};
}
//select right answers
if(isNaN(Y)){
        for(i = 0; i < X.length; i++) {
            console.log("first method");
            Xs=X.split('')[i]
            console.log(Xs)
            if(Xs==" "){}else{
                          $("#"+Xs+">.circle").empty()
            $("#"+Xs+">.circle").append(TrueSVG);
            $("#"+Xs+">.option").addClass( "true" )
            }

};
    }
else
    {for(i = 0; i < X.length; i++) {
            console.log("second method");
            Xs=X.split('')
            if(Xs==" "){}else{
            converted=String.fromCharCode(Number(Xs[i]) + 64);
            $("#"+converted+">.circle").empty()
            $("#"+converted+">.circle").append(TrueSVG);
            $("#"+converted+">.option").addClass( "true" )}
    }
};
var DefElems = document.querySelectorAll('#shuffle > div');
for (i = 1; i < container.length+1; i++) {
  $(".container:nth-of-type("+i+") .option").prepend("<span class='Letters'>("+String.fromCharCode(64+i)+")&nbsp;</span>");
  
  }

function HandleShufflingBox(){
  Persistence.setItem("ShufflingBox", $("#Shuffling").is(":checked"));
  if($("#Shuffling").is(":checked")){
    shuffle(document.querySelectorAll('#shuffle > div'));
    $(".Letters").remove();
  }else{
    reverseShuffle(document.querySelectorAll('#shuffle > div'));
  }

}

document.querySelector("#Shuffling").addEventListener("click",HandleShufflingBox)
$("#Shuffling").prop("checked", Persistence.getItem("ShufflingBox"));

if($("#Shuffling").is(":checked")){
  shuffle(document.querySelectorAll('#shuffle > div'));
  $(".Letters").remove();
}else{}

</script>`;

const ASHRAF_MCQ_CSS = `/*
made by Ashraf Nabil
ashraf.nabil132@gmail.com
01064619425
*/
#myCard{
    bottom: 0;
    left: 1%;
    right: 0;
    top:5%;
    display: flex;
    flex-direction: column;
    overflow: auto;
    min-height: 96vh;
}

/* Distractor Analysis */
.distractor-analysis {
    margin-top: 15px;
    padding: 15px;
    background-color: #fafafa;
    border-left: 4px solid #ef5350;
    border-radius: 6px;
    font-size: 0.9em;
}

.distractor-analysis h3 {
    margin: 0 0 10px 0;
    font-size: 1em;
    color: #c62828;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: bold;
}

.distractor-analysis ul {
    margin: 0;
    padding-left: 20px;
}

.distractor-analysis li {
    margin-bottom: 5px;
}

/* Clinical Pearl */
.clinical-pearl {
    margin-top: 15px;
    padding: 15px;
    background-color: #fff8e1; /* Light yellow/gold */
    border-left: 5px solid #ffc107; /* Amber */
    border-radius: 6px;
    font-size: 1em;
    color: #444;
    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}

.clinical-pearl strong {
    color: #d32f2f; /* Red accent for the label */
    display: block;
    margin-bottom: 5px;
    font-size: 1.1em;
}

/* Mnemonic */
.mnemonic {
    margin-top: 15px;
    padding: 15px;
    background-color: #f3e5f5; /* Light Lavender */
    border-left: 5px solid #9c27b0; /* Purple */
    border-radius: 6px;
    font-size: 1em;
    color: #0d47a1;
    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}

.mnemonic strong {
    color: #7b1fa2;
    display: block;
    margin-bottom: 5px;
    font-size: 1.1em;
}

/* Mermaid Diagram Container */
.mermaid-diagram {
    text-align: center;
    margin: 20px 0;
    padding: 15px;
    background: white;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.05);
}

.mermaid-diagram img {
    max-width: 100%;
    height: auto;
}

/* Source Context */
.source-context {
    margin-top: 25px;
    padding: 12px;
    background-color: #eceff1;
    border-left: 5px solid #607d8b;
    border-radius: 6px;
    font-family: 'Arial', sans-serif;
}

.source-context .literal-mention {
    font-style: italic;
    color: #455a64;
    margin-bottom: 10px;
    line-height: 1.4;
    padding-bottom: 10px;
    border-bottom: 1px dashed #b0bec5;
}

.source-context .literal-mention mark {
    background-color: #fff59d; /* Light yellow highlight */
    color: #000;
    padding: 0 2px;
    border-radius: 2px;
}

.source-context .source-meta {
    font-size: 0.85em;
    color: #37474f;
    margin-bottom: 4px;
}

/* Night Mode Support */
.nightMode .distractor-analysis {
    background-color: #263238;
    border-left-color: #ef5350;
    color: #eceff1;
}

.nightMode .distractor-analysis h3 {
    color: #ffcdd2;
}

.nightMode .clinical-pearl {
    background-color: #3e2723; /* Darker amber/brown */
    border-left-color: #ffc107;
    color: #fff8e1;
}

.nightMode .clinical-pearl strong {
    color: #ffb74d; /* Light orange */
}

.nightMode .mnemonic {
    background-color: #311b92; /* Dark Deep Purple */
    border-left-color: #ea80fc;
    color: #ede7f6;
}

.nightMode .mnemonic strong {
    color: #e040fb;
}

.nightMode .mermaid-diagram {
    background-color: #eceff1; /* Keep diagram background light for readability or invert if SVG supports it */
    border-color: #546e7a;
}

.nightMode .source-context {
    background-color: #37474f;
    border-left-color: #90a4ae;
    color: #eceff1;
}

.nightMode .source-context .literal-mention {
    color: #b0bec5;
    border-bottom-color: #546e7a;
}

.nightMode .source-context .literal-mention mark {
    background-color: #fbc02d; /* Darker yellow for night mode */
    color: #000;
}

.nightMode .source-context .source-meta {
    color: #cfd8dc;
}

.hidden{display: none;}
.table_container{
    margin-top: 30px;
    cursor: pointer;
}
.nightMode .CFAL1{
    filter: invert(1);
}
label>span>p{
    display: inline;
}
table th, table td {
    padding: 5px 15px !important;
}
table td, table th, table td rowspan {
    border: solid 1px black;
}
.table-default-style {
    border-collapse: collapse !important;
    font-size: 1em;
    margin-top: 10px;
    max-width: 900px;}

.highlighted{
    background-color: yellow;
}
.nightMode .highlighted{
    background-color: #f4b400;
}
#myCard > div:first-child{
    flex: 12;
}
#myCard > div:last-child{
    padding-top: 1em;
}
.front .container:hover {
    cursor: pointer;
}
.card {
    font-family: arial;
    font-size: 20px;
    text-align: left;
    color: black;
    background-color: white;
    margin:2vh 1vw;
}
.container {
    display: flex;
    padding: .5em;
    width: fit-content;
    align-items: center;
}
div[style="background-color: #5693d3; border-radius: 6px; padding: 5px;"]{
    display: inline-block;
    padding: 8px 10px !important;
}
/*
body.nightMode .front #shuffle>.container:hover .option{
	 	background: rgba(36, 89, 83, .6);		 
		transition: .4s !important;
		transition-timing-function: ease !important;}
.front #shuffle>.container:hover .option{
		background: rgba(199, 241, 220, .8); 
		transition: .4s !important;
		transition-timing-function: ease !important;}
*/
#shuffle>.container .option {
    border-radius: .4em;
    padding: .5em .8em;
    position: relative;
}
.back #shuffle>.container .option {
    padding: .5em .81em;
}

#shuffle>.container .option p{
margin:0px;}
.circle {
    position: relative;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    left: -15px;
    display: inline-block;
    flex-shrink: 0;
    transform: scale(1.2);
    top: -3px;
}
/* .circleF {
    background: #ff595a
}
.circleT {
    background: #059862
}
.circleF::before {
    content: "✖";
    position: relative;
    font-size: 14px;
    left: 4.5px;
    bottom: 3px
}
.circleT::before {
    content: "✔";
    position: relative;
    font-size: 14px;
    left: 4.5px;
    bottom: 3px
} */
.true {
    font-size: 20px;
    background: #c7f1dc
}
body.nightMode .true {background: #245953}

.container input[type="radio"] {
    width: 30px;
    height: 30px;
    border: .15em solid currentColor;
    position: relative;
    top: 2px;
    display: inline-block;
    flex-shrink: 0
}
div.num {
    border-bottom:1px solid;
    text-align:center;
    font-size: 0.8em;
  }
div.denom {
    font-size: 0.8em;
    border-top: 1px solid;
    text-align: center;
  }
span.stacked{
    display:inline-block;
    margin: 0px 5px;
}


.back .container{margin-left: 17px;}
.front .Percent{display: none;}
.container input[type="checkbox"] {
    display: none;
    width: 1.6em;
    height: 1.6em;
    position: relative;
    top: 7px;
}
.front .container::before{
    content: "";
    display: inline-block;
    flex-shrink: 0;
    vertical-align: top;
    height: 1.15em;
    width: 1.15em;
    margin-right: 0.6em;
    color: rgba(0, 0, 0, 0.275);
    border: solid 0.06em;
    box-shadow: 0 0 0.04em, 0 0.06em 0.16em -0.03em inset, 0 0 0 0.07em transparent inset;
    border-radius: 0.2em;
    background: url('data:image/svg+xml;charset=UTF-8,<svg xmlns="http://www.w3.org/2000/svg" version="1.1" xml:space="preserve" fill="white" viewBox="0 0 9 9"><rect x="0" y="4.3" transform="matrix(-0.707 -0.7072 0.7072 -0.707 0.5891 10.4702)" width="4.3" height="1.6" /><rect x="2.2" y="2.9" transform="matrix(-0.7071 0.7071 -0.7071 -0.7071 12.1877 2.9833)" width="6.1" height="1.7" /></svg>') no-repeat center, white;
    background-size: 0;
    will-change: color, border, background, background-size, box-shadow;
    transform: translate3d(0, 0, 0);
    transition: color 0.1s, border 0.1s, background 0.15s, box-shadow 0.1s;
}
.back .container::before {    
    content: "";
    display: inline-block;
    vertical-align: top;
    height: 25.38px;
}
.check::before{
    background-color: #3B99FC !important;
    background-size: 0.75em !important;
    color: rgba(0, 0, 0, 0.075) !important;
}

















.header {
            font: bold 17px/1.5em;
            padding-left: 0.5em;
        }

.header-yellow {
            border-left: 4px solid #f4b400;
            color: #f4b400;
        }
.content {
            padding-left: 0.5em;
            border-left: 4px solid transparent;
        }




        #settings{
            display: flex;
            height: 70px;
        }

#settings-content{
    margin-left: 2em;
    display: flex;
    align-items: center;
}
        #gear {
            cursor: pointer;
            display: flex;
            align-items: center;
        }

        #zoom{
            display: flex;
            position: relative;
            align-items: center;
        }
        #zoom div{
            display: inline-block;
            cursor: pointer;
        }
        #zoom #negative{
            margin-left: 5px;
        }
        
        #switch{
            display: flex;
            position: relative;
            align-items: center;
        }
        #switch .check-box{
            display: flex;
        }
        
#extra-section{
    cursor: pointer;
}










        .check-box label{
            padding: 0px 5px 0px 50px;
    
        }

        
        .check-box input[type="checkbox"] {
            position: relative;
            appearance: none;
            width: 50px;
            height: 25px;
            background: #ccc;
            border-radius: 50px;
            box-shadow: inset 0 0 2px rgba(0, 0, 0, 0.2);
            cursor: pointer;
            transition: 0.4s !important;
            display: flex;
        }

        .check-box input:checked[type="checkbox"] {
            background: #059862;
        }
        
        .check-box input[type="checkbox"]::after {
            position: absolute;
            content: "";
            width: 25px;
            height: 25px;
            top: 0;
            left: 0;
            background: #fff;
            border-radius: 50%;
            box-shadow: 0 0 5px rgba(0, 0, 0, 0.2);
            transform: scale(1.1);
            transition: 0.4s;
        }
        
        
        .check-box input:checked[type="checkbox"]::after {
            left: 50%;
        }
`;

const ASHRAF_MCQ_MODEL_TEMPLATES = [{
    name: 'Card 1',
    qfmt: ASHRAF_MCQ_FRONT_TEMPLATE,
    afmt: ASHRAF_MCQ_BACK_TEMPLATE
}];


// Helper to generate a unique ID from a string, similar to genanki
const stringToId = (str: string): number => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0; // Convert to 32bit integer
    }
    return Math.abs(hash);
};

// Helper for checksum, as required by Anki
const ankiChecksum = (str: string): number => {
    let sum = 0;
    // Anki's checksum is on the first 50 chars of the sort field.
    const s = str.slice(0, 50);
    for (let i = 0; i < s.length; i++) {
        sum += s.charCodeAt(i);
    }
    // Convert to a 32-bit unsigned integer
    return sum >>> 0;
};

function b64toBlob(b64Data: string, contentType = '', sliceSize = 512): Blob {
    const byteCharacters = atob(b64Data);
    const byteArrays = [];
    for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
        const slice = byteCharacters.slice(offset, offset + sliceSize);
        const byteNumbers = new Array(slice.length);
        for (let i = 0; i < slice.length; i++) {
            byteNumbers[i] = slice.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        byteArrays.push(byteArray);
    }
    return new Blob(byteArrays, { type: contentType });
}

function toCsvField(str: string | undefined | null): string {
    if (str === null || str === undefined) {
        return '';
    }
    const s = String(str);
    const needsQuotes = s.includes(',') || s.includes('"') || s.includes('\n');
    if (needsQuotes) {
        const escapedStr = s.replace(/"/g, '""');
        return `"${escapedStr}"`;
    }
    return s;
}

function convertMarkdownToHtml(text: string): string {
    if (!text) return '';
    let html = text;
    // Heuristic: ensure newlines before bullet points if they follow a colon or text
    // Looks for "- **" pattern which is common for options in this specific prompt style
    html = html.replace(/([^\n])\s*-\s*\*\*/g, '$1<br>- **');
    
    return html
        // Bold: **text** or __text__ -> <b>text</b>
        .replace(/(\*\*|__)(.*?)\1/g, '<b>$2</b>')
        // Italic: *text* or _text_ -> <i>text</i>
        .replace(/(\*|_)(.*?)\1/g, '<i>$2</i>')
        // Highlights: ==text== -> <mark>text</mark>
        .replace(/==(.*?)==/g, '<mark>$1</mark>')
        // Newlines to <br>
        .replace(/\n/g, '<br>');
}

// Function to format sources into a clean HTML "Tree" structure with inline styles
function formatSourcesHtml(sources: { breadcrumbs: string, url?: string, snippet?: string }[] | undefined, deckName: string): string {
    let html = '<div class="source-context" style="margin-top: 25px; padding: 12px; background-color: #eceff1; border-left: 5px solid #607d8b; border-radius: 6px; font-family: \'Arial\', sans-serif; color: #333333;">';
    
    if (sources && sources.length > 0) {
        sources.forEach(source => {
            // 1. Literal Mention (Quote)
            if (source.snippet) {
                const formattedSnippet = convertMarkdownToHtml(source.snippet);
                html += `
                <div style="font-style: italic; color: #455a64; margin-bottom: 8px; line-height: 1.4; background-color: rgba(255,255,255,0.5); padding: 4px; border-radius: 4px;">
                    "${formattedSnippet}"
                </div>`;
            }
            
            // 2. Lesson Source
            const pathText = source.breadcrumbs || (source as any).title || 'Unknown Source';
            const styledPath = String(pathText).replace(/\s*>\s*/g, ' <span style="color: #90a4ae;">➝</span> ');
            html += `
            <div style="font-size: 0.9em; color: #37474f; border-top: 1px dashed #b0bec5; padding-top: 6px; margin-bottom: 4px;">
                <strong style="color: #263238;">📖 Source:</strong> `;
            
            if (source.url) {
                html += `<a href="${source.url}" style="color: #0277bd; text-decoration: none; font-weight: 500;">${styledPath}</a>`;
            } else {
                html += styledPath;
            }
            html += `</div>`;
        });
    }

    // 3. Question Source (Deck Name) - Always included
    const deckPath = deckName.replace(/::/g, ' <span style="color: #90a4ae;">➝</span> ');
    html += `
    <div style="font-size: 0.9em; color: #37474f; border-top: ${sources && sources.length > 0 ? 'none' : '1px dashed #b0bec5'}; padding-top: 6px;">
        <strong style="color: #263238;">📍 Deck Source:</strong> ${deckPath}
    </div>`;
    
    html += '</div>';
    return html;
}

// Helper to process explanation text and apply inline styles to specific sections
export function processExplanationHtml(text: string): string {
    if (!text) return '';
    
    let html = convertMarkdownToHtml(text);

    // --- 1. Apply Styles to Containers ---

    // Mnemonic Container
    html = html.replace(
        /<div class=["']mnemonic["']>/gi, 
        `<div class="mnemonic" style="background-color: #f3e5f5; color: #333333; border-left: 5px solid #9c27b0; padding: 15px; border-radius: 8px; margin-top: 15px; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">`
    );

    // Clinical Pearl Container
    html = html.replace(
        /<div class=["']clinical-pearl["']>/gi,
        `<div class="clinical-pearl" style="background-color: #fff8e1; color: #333333; border-left: 5px solid #ffc107; padding: 15px; border-radius: 8px; margin-top: 15px; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">`
    );

    // Distractor Analysis Container
    html = html.replace(
        /<div class=["']distractor-analysis["']>/gi,
        `<div class="distractor-analysis" style="background-color: #fafafa; color: #333333; border-left: 4px solid #ef5350; padding: 15px; border-radius: 8px; margin-top: 15px;">`
    );

    // Source Context Container
    html = html.replace(
        /<div class=["']source-context["']>/gi,
        `<div class="source-context" style="margin-top: 25px; padding: 12px; background-color: #eceff1; color: #333333; border-left: 5px solid #607d8b; border-radius: 6px; font-family: 'Arial', sans-serif;">`
    );

    // --- 2. Apply Styles to Headers/Titles ---

    // Mnemonic Title
    html = html.replace(
        /<strong>(?:🧠\s*)?Mnemonic:?<\/strong>/gi,
        `<strong style="color: #7b1fa2; display: block; margin-bottom: 5px; font-size: 1.1em;">🧠 Mnemonic:</strong>`
    );

    // Clinical Pearl Title
    html = html.replace(
        /<strong>(?:💡\s*)?Clinical Pearl:?<\/strong>/gi,
        `<strong style="color: #d32f2f; display: block; margin-bottom: 5px; font-size: 1.1em;">💡 Clinical Pearl:</strong>`
    );

    // Distractor Analysis Title
    html = html.replace(
        /<h3>(?:❌\s*)?(?:Why others are incorrect|Distractor Analysis):?<\/h3>/gi,
        `<h3 style="color: #c62828; margin: 0 0 10px 0; font-size: 1em; text-transform: uppercase; font-weight: bold;">❌ Why others are incorrect:</h3>`
    );

    // Source Context Title
    html = html.replace(
        /<strong>(?:📚\s*)?Source(?:\s*Context)?:?<\/strong>/gi,
        `<strong style="color: #455a64; display: block; margin-bottom: 5px; font-size: 1.1em;">📚 Source:</strong>`
    );

    // --- 3. Fallback for Markdown (Legacy/Fallback) ---
    // In case the AI outputs Markdown instead of HTML, we catch it here and wrap it.
    
    // Mnemonic (Markdown fallback)
    html = html.replace(
        /(?:<p>|<br>|^)\s*<b>(?:🧠\s*)?Mnemonic:?<\/b>\s*(.*?)(?:<\/p>|<br>|$)/gis, 
        `<div class="mnemonic" style="background-color: #f3e5f5; color: #333333; border-left: 5px solid #9c27b0; padding: 15px; border-radius: 8px; margin-top: 15px; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">
            <strong style="color: #7b1fa2; display: block; margin-bottom: 5px; font-size: 1.1em;">🧠 Mnemonic:</strong>
            $1
        </div>`
    );

    // Clinical Pearl (Markdown fallback)
    html = html.replace(
        /(?:<p>|<br>|^)\s*<b>(?:💡\s*)?Clinical Pearl:?<\/b>\s*(.*?)(?:<\/p>|<br>|$)/gis,
        `<div class="clinical-pearl" style="background-color: #fff8e1; color: #333333; border-left: 5px solid #ffc107; padding: 15px; border-radius: 8px; margin-top: 15px; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">
            <strong style="color: #d32f2f; display: block; margin-bottom: 5px; font-size: 1.1em;">💡 Clinical Pearl:</strong>
            $1
        </div>`
    );

    // Distractor Analysis (Markdown fallback)
    html = html.replace(
        /(?:<p>|<br>|^)\s*<b>(?:❌\s*)?(?:Why others are incorrect|Distractor Analysis):?<\/b>(?:<\/p>|<br>)?(.*?)(?:<div|$)/gis,
        `<div class="distractor-analysis" style="background-color: #fafafa; color: #333333; border-left: 4px solid #ef5350; padding: 15px; border-radius: 8px; margin-top: 15px;">
            <h3 style="color: #c62828; margin: 0 0 10px 0; font-size: 1em; text-transform: uppercase; font-weight: bold;">❌ Why others are incorrect:</h3>
            $1
        </div>`
    );

    // Source Context (Markdown fallback)
    html = html.replace(
        /(?:<p>|<br>|^)\s*<b>(?:📚\s*)?Source(?:\s*Context)?:?<\/b>\s*(.*?)(?:<\/p>|<br>|$)/gis,
        `<div class="source-context" style="margin-top: 25px; padding: 12px; background-color: #eceff1; color: #333333; border-left: 5px solid #607d8b; border-radius: 6px; font-family: 'Arial', sans-serif;">
            <strong style="color: #455a64; display: block; margin-bottom: 5px; font-size: 1.1em;">📚 Source:</strong>
            <div style="font-style: italic; color: #455a64; margin-bottom: 8px; line-height: 1.4;">
                $1
            </div>
        </div>`
    );

    return html;
}



let SQL: any;
let noteIdCounter = 0;

export const ankiService = {
    async generateCsv(deckName: string, cards: AnkiCard[]): Promise<Blob> {
        // The first column is "Deck" for Anki deck override
        const headers = ['Deck', ...ASHRAF_MCQ_MODEL_FIELDS.map(f => f.name)];
        
        const rows: (string | undefined)[][] = [];
        let cardIndex = 0;
        
        for (const card of cards) {
            if (cardIndex++ % 500 === 0) {
                await new Promise(r => setTimeout(r, 0)); // Yield to main thread
            }
            
            let questionText = card.question;
            let explanationText = card.explanation || '';

            // --- MERMAID RENDERING LOGIC FOR CSV ---
            const mermaidRegex = /```mermaid\s*([\s\S]*?)\s*```/g;
            const matches: RegExpExecArray[] = [];
            let m;
            while ((m = mermaidRegex.exec(explanationText)) !== null) {
                matches.push(m);
            }

            for (const match of matches) {
                 const mermaidCode = match[1];
                 const diagramId = `mermaid-csv-${uuidv4().slice(0, 8)}`;
                 const sanitizedCode = sanitizeMermaidCode(mermaidCode);
                 try {
                    if ((window as any).mermaid && sanitizedCode) {
                        const { svg } = await (window as any).mermaid.render(diagramId, sanitizedCode);
                        // Convert SVG to Base64 for CSV embedding
                        const base64 = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
                        explanationText = explanationText.replace(match[0], `<div class="mermaid-diagram" style="text-align:center; margin: 10px 0;"><img src="${base64}"></div>`);
                    }
                 } catch (e) {
                     console.error("Mermaid CSV Render Error", e);
                 }
            }

            // Convert Markdown to HTML for the explanation text, applying inline styles
            explanationText = processExplanationHtml(explanationText);

            if (card.question_image_b64) {
                // Embed base64 image directly into the CSV field. Anki can render this.
                // Appended to Question field as per template
                questionText += `<br><img src="${card.question_image_b64}">`;
            }
            
            const fieldData: { [key: string]: string } = {};
            fieldData['Question'] = questionText;
            
            // Append structured sources and deck source to the explanation
            const specificDeck = card.deck_name || deckName;
            
            // Use the updated formatSourcesHtml which now includes the deck source and literal mention
            const sourcesHtml = formatSourcesHtml((card as any).sources, specificDeck);
            
            fieldData['Explanation'] = explanationText + sourcesHtml;
            
            // AGGRESSIVE SANITIZATION for Answers: "a, b" -> "AB"
            let rawAns = Array.isArray(card.answer) ? card.answer.join('') : (card.answer || '');
            fieldData['Ans'] = rawAns.replace(/[^a-zA-Z]/g, '').toUpperCase();
    
            if (card.choices && Array.isArray(card.choices)) {
                card.choices.forEach(choice => {
                    // Robustly parse the label to handle "A", "a.", "B)", etc.
                    const normalizedLabel = (choice.label || '').trim().toUpperCase().charAt(0);
                    if (normalizedLabel) {
                        const index = normalizedLabel.charCodeAt(0) - 'A'.charCodeAt(0) + 1;
                        // Check if it's a valid letter A-H
                        if (index >= 1 && index <= 8) {
                            // Construct the exact field name required by the template
                            const fieldName = `option_${index} (${normalizedLabel})`;
                            fieldData[fieldName] = choice.text;
                        }
                    }
                });
            }
            
            // Return [DeckName, ...Fields]
            rows.push([specificDeck, ...ASHRAF_MCQ_MODEL_FIELDS.map(field => fieldData[field.name] || '')]);
        }
    
        let csvContent = '#deck column:1\n';
        const CHUNK_SIZE = 1000;
        let rowIndex = 0;
        
        while (rowIndex < rows.length) {
            if (rowIndex % 5000 === 0) {
                await new Promise(r => setTimeout(r, 0)); // Yield to main thread
            }
            const chunk = rows.slice(rowIndex, rowIndex + CHUNK_SIZE);
            csvContent += chunk.map(row => row.map(toCsvField).join(',')).join('\n') + '\n';
            rowIndex += CHUNK_SIZE;
        }
    
        return new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
    },
    
    async generateApkg(deckName: string, cards: AnkiCard[]): Promise<Blob> {
        if (!SQL) {
            SQL = await initSqlJs({
                locateFile: (file: string) => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${file}`
            });
        }
        const db = new SQL.Database();

        const now = Date.now();
        const mod = Math.floor(now / 1000); // Anki uses seconds
        const deckId = stringToId(deckName);
        const modelId = stringToId(ASHRAF_MCQ_MODEL_NAME);

        const col = {
            id: 1,
            crt: mod,
            mod: mod,
            scm: mod,
            ver: 11,
            dty: 0,
            usn: 0,
            ls: 0,
            conf: JSON.stringify({
                "nextPos": 1,
                "estTimes": true,
                "activeDecks": [1],
                "sortType": "noteFld",
                "timeLim": 0,
                "sortBackwards": false,
                "addToCur": true,
                "curDeck": 1,
                "newBury": true,
                "newSpread": 0,
                "dueCounts": true,
                "curModel": modelId.toString(),
                "collapseTime": 1200
            }),
            models: JSON.stringify({
                [modelId]: {
                    id: modelId,
                    name: ASHRAF_MCQ_MODEL_NAME,
                    type: 0,
                    mod: mod,
                    usn: -1,
                    sortf: 0,
                    did: deckId,
                    tmpls: ASHRAF_MCQ_MODEL_TEMPLATES,
                    flds: ASHRAF_MCQ_MODEL_FIELDS.map((f, i) => ({ ...f, ord: i, sticky: false, rtl: false, font: 'Arial', size: 20, media: [] })),
                    css: ASHRAF_MCQ_CSS,
                    latexPre: "\\documentclass[12pt]{article}\\n\\special{papersize=3in,5in}\\n\\usepackage[utf8]{inputenc}\\n\\usepackage{amssymb,amsmath}\\n\\pagestyle{empty}\\n\\setlength{\\parindent}{0in}\\n\\begin{document}\\n",
                    latexPost: "\\end{document}"
                }
            }),
            decks: JSON.stringify({
                [deckId]: {
                    id: deckId,
                    name: deckName,
                    mod: mod,
                    usn: -1,
                    desc: "",
                    dyn: 0,
                    conf: 1,
                    extendNew: 10,
                    extendRev: 50,
                    collapsed: false,
                    newToday: [0, 0],
                    revToday: [0, 0],
                    lrnToday: [0, 0],
                    timeToday: [0, 0],
                },
                "1": {
                    id: 1,
                    name: "Default",
                    mod: mod,
                    usn: -1,
                    desc: "",
                    dyn: 0,
                    conf: 1,
                    extendNew: 10,
                    extendRev: 50,
                    collapsed: false,
                    newToday: [0, 0],
                    revToday: [0, 0],
                    lrnToday: [0, 0],
                    timeToday: [0, 0],
                }
            }),
            dconf: JSON.stringify({
                "1": {
                    "id": 1,
                    "name": "Default",
                    "mod": 0,
                    "usn": 0,
                    "maxTaken": 60,
                    "autoplay": true,
                    "timer": 0,
                    "replayq": true,
                    "new": { "bury": true, "delays": [1, 10], "initialFactor": 2500, "ints": [1, 4, 7], "order": 1, "perDay": 20, "steps": [1, 10] },
                    "rev": { "bury": true, "ease4": 1.3, "ivlFct": 1, "maxIvl": 36500, "perDay": 200, "hardFactor": 1.2 },
                    "lapse": { "delays": [10], "leechAction": 0, "leechFails": 8, "minInt": 1, "mult": 0 },
                    "misc": {}
                }
            }),
            tags: "{}"
        };

        db.run(`
            CREATE TABLE col (
                id              integer primary key,
                crt             integer not null,
                mod             integer not null,
                scm             integer not null,
                ver             integer not null,
                dty             integer not null,
                usn             integer not null,
                ls              integer not null,
                conf            text not null,
                models          text not null,
                decks           text not null,
                dconf           text not null,
                tags            text not null
            );
        `);
        db.run("INSERT INTO col VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", Object.values(col));

        db.run(`
            CREATE TABLE notes (
                id              integer primary key,
                guid            text not null,
                mid             integer not null,
                mod             integer not null,
                usn             integer not null,
                tags            text not null,
                flds            text not null,
                sfld            text not null,
                csum            integer not null,
                flags           integer not null,
                data            text not null
            );
        `);
        db.run(`
            CREATE TABLE cards (
                id              integer primary key,
                nid             integer not null,
                did             integer not null,
                ord             integer not null,
                mod             integer not null,
                usn             integer not null,
                type            integer not null,
                queue           integer not null,
                due             integer not null,
                ivl             integer not null,
                factor          integer not null,
                reps            integer not null,
                lapses          integer not null,
                left            integer not null,
                odue            integer not null,
                odid            integer not null,
                flags           integer not null,
                data            text not null
            );
        `);
        db.run(`
            CREATE TABLE revlog (
                id              integer primary key,
                cid             integer not null,
                usn             integer not null,
                ease            integer not null,
                ivl             integer not null,
                lastIvl         integer not null,
                factor          integer not null,
                time            integer not null,
                type            integer not null
            );
        `);
        db.run(`
            CREATE TABLE graves (
                usn             integer not null,
                oid             integer not null,
                type            integer not null
            );
        `);

        const stmtNotes = db.prepare("INSERT INTO notes (id, guid, mid, mod, usn, tags, flds, sfld, csum, flags, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        const stmtCards = db.prepare("INSERT INTO cards (id, nid, did, ord, mod, usn, type, queue, due, ivl, factor, reps, lapses, left, odue, odid, flags, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        
        const mediaFiles = new Map<string, Blob>();
        const mediaFilenames: string[] = [];
        
        // Use a transaction for bulk insertion to significantly improve speed and prevent freezing
        db.run("BEGIN TRANSACTION");

        try {
            let cardIndex = 0;
            for (const card of cards) {
                if (cardIndex++ % 500 === 0) {
                    await new Promise(r => setTimeout(r, 0)); // Yield to main thread
                }
                
                const noteId = Date.now() + noteIdCounter++;
                const guid = uuidv4().slice(0, 10);
                
                let questionText = card.question;
                let imageField = '';
                let explanationText = card.explanation || '';

                // --- MERMAID RENDERING LOGIC ---
                // Check if explanation contains mermaid code block
                const mermaidRegex = /```mermaid\s*([\s\S]*?)\s*```/g;
                let match;
                // We need to handle multiple diagrams if present, though prompt asks for one usually.
                // Since replace is synchronous and we need async rendering, we'll do a manual loop.
                
                // Note: mermaid.render is async. We must await it.
                // We can't use replace with async callback easily.
                
                const mermaidReplacements: { match: string, filename: string, blob: Blob }[] = [];
                
                while ((match = mermaidRegex.exec(explanationText)) !== null) {
                    const mermaidCode = match[1];
                    const diagramId = `mermaid-${uuidv4().slice(0, 8)}`;
                    const filename = `${diagramId}.svg`;
                    const sanitizedCode = sanitizeMermaidCode(mermaidCode);
                    
                    try {
                        // Check if mermaid is available on window
                        if ((window as any).mermaid && sanitizedCode) {
                            // Render to SVG
                            // mermaid.render(id, text) returns { svg: string }
                            const { svg } = await (window as any).mermaid.render(diagramId, sanitizedCode);
                            
                            // Create Blob from SVG string
                            const svgBlob = new Blob([svg], { type: 'image/svg+xml' });
                            
                            mermaidReplacements.push({
                                match: match[0], // The full ```mermaid ... ``` block
                                filename: filename,
                                blob: svgBlob
                            });
                        }
                    } catch (e) {
                        console.error("Failed to render Mermaid diagram for Anki:", e);
                        // If fails, we leave the code block as is, or maybe wrap it in a pre tag?
                        // For now, let's leave it, or maybe replace with a "Diagram Error" text.
                    }
                }

                // Apply replacements
                for (const rep of mermaidReplacements) {
                    explanationText = explanationText.replace(rep.match, `<div class="mermaid-diagram" style="text-align:center; margin: 10px 0;"><img src="${rep.filename}"></div>`);
                    mediaFiles.set(rep.filename, rep.blob);
                    mediaFilenames.push(rep.filename);
                }

                // Convert Markdown to HTML for the explanation text, applying inline styles
                explanationText = processExplanationHtml(explanationText);
                
                if (card.question_image_b64) {
                     // Create a unique filename for Anki's media collection
                    const filename = `aurenex-media-${uuidv4().slice(0, 8)}.jpg`;
                    mediaFilenames.push(filename);
    
                    const b64Data = card.question_image_b64.split(',')[1];
                    if (b64Data) {
                        const imageBlob = b64toBlob(b64Data, 'image/jpeg');
                        mediaFiles.set(filename, imageBlob);
    
                        // Append the image tag to the question text for the final Anki card
                        questionText += `<br><img src="${filename}">`;
                    }
                }
                
                // --- ROBUST FIELD MAPPING ---
                const fieldData: { [key: string]: string } = {};
                fieldData['Question'] = questionText;
                
                // Append structured sources and deck source to the explanation
                const specificDeck = card.deck_name || deckName;
                
                // Use the updated formatSourcesHtml which now includes the deck source and literal mention
                const sourcesHtml = formatSourcesHtml((card as any).sources, specificDeck);
                
                fieldData['Explanation'] = explanationText + sourcesHtml;
                
                // AGGRESSIVE SANITIZATION for Answers: "a, b" -> "AB"
                let rawAns = Array.isArray(card.answer) ? card.answer.join('') : (card.answer || '');
                fieldData['Ans'] = rawAns.replace(/[^a-zA-Z]/g, '').toUpperCase();
    
                if (card.choices && Array.isArray(card.choices)) {
                    card.choices.forEach(choice => {
                        // Robustly parse the label to handle "A", "a.", "B)", etc.
                        const normalizedLabel = (choice.label || '').trim().toUpperCase().charAt(0);
                        if (normalizedLabel) {
                            const index = normalizedLabel.charCodeAt(0) - 'A'.charCodeAt(0) + 1;
                            // Check if it's a valid letter A-H
                            if (index >= 1 && index <= 8) {
                                // Construct the exact field name required by the template
                                const fieldName = `option_${index} (${normalizedLabel})`;
                                fieldData[fieldName] = choice.text;
                            }
                        }
                    });
                }
                
                const fields = ASHRAF_MCQ_MODEL_FIELDS.map(field => fieldData[field.name] || '');
                const fldsStr = fields.join('\x1f');
                const sfld = card.question.replace(/<.*?>/g, ""); // Sort field should be plain text
                const csum = ankiChecksum(sfld);
    
                stmtNotes.run([noteId, guid, modelId, mod, -1, "", fldsStr, sfld, csum, 0, ""]);
                stmtCards.run([noteId, noteId, deckId, 0, mod, -1, 0, 0, noteId, 0, 0, 0, 0, 0, 0, 0, 0, ""]);
            }
            db.run("COMMIT");
        } catch (e) {
            console.error("SQL Transaction failed, rolling back", e);
            db.run("ROLLBACK");
            throw e;
        } finally {
            stmtNotes.free();
            stmtCards.free();
        }
        
        const db_buffer = db.export();
        db.close();
        
        const zip = new JSZip();
        const mediaJson: { [key: string]: string } = {};
        
        for (let i = 0; i < mediaFilenames.length; i++) {
            // map index to filename: "0": "aurenex-media-uuid.jpg"
            mediaJson[i.toString()] = mediaFilenames[i];
        }

        zip.file("collection.anki2", db_buffer);
        zip.file("media", JSON.stringify(mediaJson));

        for (let i = 0; i < mediaFilenames.length; i++) {
            const filename = mediaFilenames[i];
            const blob = mediaFiles.get(filename);
            if (blob) {
                // The file in the zip is named by its index.
                zip.file(i.toString(), blob);
            }
        }

        return zip.generateAsync({ type: "blob", mimeType: 'application/apkg' });
    }
};