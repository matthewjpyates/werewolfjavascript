let deferredPrompt;
const addBtn = document.querySelector('.add-button');

window.addEventListener('beforeinstallprompt', (e) => {
  // Prevent Chrome 67 and earlier from automatically showing the prompt
  e.preventDefault();
  // Stash the event so it can be triggered later.
  deferredPrompt = e;
  // Update UI to notify the user they can add to home screen
  addBtn.style.display = 'block';

  addBtn.addEventListener('click', (e) => {
    // hide our user interface that shows our A2HS button
    addBtn.style.display = 'none';
    // Show the prompt
    deferredPrompt.prompt();
    // Wait for the user to respond to the prompt
    deferredPrompt.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === 'accepted') {
        console.log('User accepted the A2HS prompt');
      } else {
        console.log('User dismissed the A2HS prompt');
      }
      deferredPrompt = null;
    });
  });
});

// global varibles to keep track of keys and who we are talking to
var local_key_pair;
var chat_id;
var distant_key;
var dist_id;
var message_holder;
var keys_published = false;

// Text Encoder and Decoder to move Strings back and forth to byte arrays
var text_encoder = new TextEncoder(); // always utf-8
var text_decoder = new TextDecoder("utf-8");


// holds chat ids
var distant_end_chat_ids = null;

// tracker for interval runner
var intervalID = null;

// pulls messages
function start_pulling_messages()
{
  intervalID = window.setInterval(pull_message,1500);
}

// stops the pulling of messages
function stop_pulling_messages()
{
  if(intervalID != null){
  clearInterval(intervalID);
  }
}

function set_error(error_text) {
  console.error(error_text);
  document.getElementById("status_field").innerHTML = error_text;
  document.getElementById("status_field").style.color = "red";
}

function clear_error() {
  document.getElementById("status_field").innerHTML = "";
  document.getElementById("status_field").style.color = "black";
}


function set_status(status_text) {
  clear_error();
  document.getElementById("status_field").innerHTML = status_text;

}


// stole this from stack overflow
//document.getElementById('input-file')
//  .addEventListener('change', getFile)

function getFile(event) {
  const input = event.target
  if ('files' in input && input.files.length > 0) {
    parseKeyFileContent(input.files[0])
  }
}



// the key file should be private key, public key, and chat id
function parseKeyFileContent(file) {
  readFileContent(file).then(content => {
    var parts = content.split(",");
    if (parts.length == 3) {
      local_key_pair.privateKey = parts[0];
      local_key_pair.privateKey = parts[1];
      change_chat_id(parts[2]);
    }
    else {
      set_error("The key file is incorrectly formatted");

    }
  }).catch(error => console.log(error))
}



function readFileContent(file) {
  const reader = new FileReader()
  return new Promise((resolve, reject) => {
    reader.onload = event => resolve(event.target.result)
    reader.onerror = error => reject(error)
    reader.readAsText(file)
  })
}




//returns the hostname of the page to make sure that https, tor, and i2p doesn't criss cross
function get_host() {
  return window.location.hostname;
}


// load the dist ends to choose from
function load_change_dist_end() {

  set_status("pulling user list from server")

  document.getElementById("main").innerHTML = "<h3>Choose who to talk to:<h3>" +
    "<p>search:" +
    "<input type=\"text\" id=\"search_text\" oninput=\"search_field_input()\">" +
    "</p>" +
    "<ul id=\"chat_id_list\">" +
    "</ul>";

    var xmlhttp = new XMLHttpRequest();
    var url = "/api/pubkeys";
    
    xmlhttp.onreadystatechange = function() {
    if (this.readyState == 4 && this.status == 200) {
      distant_end_chat_ids = JSON.parse(this.responseText);

      set_status("making buttons")
        build_user_buttons();
        set_status("")

        }
    };

    xmlhttp.open("GET", url, true);
    xmlhttp.send();
  
}

function build_user_buttons(search_text=null)
{
  document.getElementById("chat_id_list").innerHTML = "";
  //console.log(distant_end_chat_ids)

  for ( var ii =0; ii < distant_end_chat_ids.length; ii++) {
    var user  = distant_end_chat_ids[ii];
    console.log(user)  
    if ((search_text == null) || (search_text != null && user.chatid.toLowerCase().includes(search_text.toLowerCase()) ))
    {
      document.getElementById("chat_id_list").innerHTML = document.getElementById("chat_id_list").innerHTML + 
      "<li><button class=\"add-button\" id=\"change_dist_id_to_"+user.chatid +"\"" +
      " onclick=\"set_dist_end(\'"+user.chatid+"\' , \'"+user.pubkeyhexstr+"\')\" >"+user.chatid+"</button> </li>";
    }
  
  }
 
}



// reduces the size of returned chat ids to only chat ids that contain the string that is in the search textbox
function search_field_input() {
var search_text = document.getElementById("search_text").value; 
build_user_buttons(search_text);
}


// set distant end
// gets passed in as a hex string need to convert to unsigned 8bit int array
function set_dist_end(new_chat_id, pub_key) {
  distant_key = convert_hex_array_to_uint8bit_array(pub_key);
  dist_id =new_chat_id;
  document.getElementById("chattingtospan").innerHTML = new_chat_id;
}


//load your keys or generate new ones
function load_change_local_end() {
  document.getElementById("main").innerHTML = "<h3>Change your chat id, generate new keys, or load offline keys:<h3>" +
    "<h4>Note your keys will be created locally in your browser, your private key will not be set to the server</h4>" +
    "<p>Chat Id:" +
    "<input type=\"text\" id=\"chat_id_local_user\" oninput=\"search_field_input()\">" +
    "<button class=\"add-button\" id=\"change_local_chat_id\" onclick=\"change_chat_id_and_publish()\" >Change Chat ID</button>  </p>" +
    "<p>Keys: " +
    "<span id=\"key_status_span\"> </span>" +
    "<button class=\"add-button\" id=\"make_new_keys\" onclick=\"make_new_keys()\">Generate New Keys</button> " +
    "<label for=\"input-file\">Load Keys:</label>" +
    "<input type=\"file\" id=\"input-file\">" +                          //"<button class=\"add-button\" id=\"load_keys\" onclick=\"load_keys()\">Load Keys</button> " +
    "</p>";

  document.getElementById('input-file')
    .addEventListener('change', getFile);

}

// loads the messages
function load_messages() {
  document.getElementById("main").innerHTML = "<h3>Your End to End Quantum Resistan Encrypted Messages:<h3>" +
    "<ul id=\"messages_list\">" +
    "</ul>" +
    "<p>" +
    "<textarea id=\"message_to_send\" rows=\"4\" cols=\"50\"><textarea>" +
    "<button class=\"add-button\" id=\"send_message\" onclick=\"send_message()\">Send</button>" +
    "</p>"


}


// changes the chat id of the local user and sends to the server
function change_chat_id_and_publish() {
  change_chat_id(document.getElementById("chat_id_local_user").value)
  // TODO add the publishing part
}

// from https://gist.github.com/6174/6062387
function make_uuid_string() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// changes the chat id of the local user and sends to the server
function make_new_keys() {

  set_status("Generating Keys");

  local_key_pair = ntru.keyPair();

  set_status("Keys Generated");

}

function change_chat_id(new_chat_id) {
  chat_id = new_chat_id;
  document.getElementById("chattingasspan").innerHTML = new_chat_id;
}


// changes the chat id of the local user and sends to the server
function load_keys() {

}

function download(filename, text) {
  var element = document.createElement('a');
  element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
  element.setAttribute('download', filename);

  element.style.display = 'none';
  document.body.appendChild(element);

  element.click();

  document.body.removeChild(element);
}

function convert_uint8bit_array_to_hex_array(input_key) {
  output_hex_str = ""

  for (let val in input_key) {
    // operation
    output_hex_str = output_hex_str + val.toString(16);
  }
  return output_hex_str;

}

function convert_hex_array_to_uint8bit_array(input_hex_str) {
  var bytes = new Uint8Array(Math.ceil(input_hex_str.length / 2));
  for (var i = 0; i < bytes.length; i++) 
  {
    bytes[i] = parseInt(input_hex_str.substr(i * 2, 2), 16);
  }
  return bytes;
}




// save the keyfile
// private key, public key, chatid
function save_keyfile() {
  var text_to_be_saved = convert_uint8bit_array_to_hex_array(local_key_pair.privateKey) + "," + convert_uint8bit_array_to_hex_array(local_key_pair.publicKey) + "," + chat_id;
  download("werewolfchat.keys", text_to_be_saved);
}


// save the messages
function save_messages() {
  download("messages.txt", message_holder);

}

// initiallize the page with a random chat id
window.onload = function () {

  make_new_keys();
  change_chat_id("new_user_number_" + make_uuid_string());
  keys_published = false;
};


