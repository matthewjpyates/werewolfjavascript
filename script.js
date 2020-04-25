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
var token = null;
var keys_published = false;

var last_pull_time = null;

// Text Encoder and Decoder to move Strings back and forth to byte arrays
var text_encoder = new TextEncoder(); // always utf-8
var text_decoder = new TextDecoder("utf-8");


// holds chat ids
var distant_end_chat_ids = null;

// tracker for interval runner
var intervalID = null;

// pulls messages
function start_pulling_messages() {
  intervalID = window.setInterval(pull_message, 1500);
}

// stops the pulling of messages
function stop_pulling_messages() {
  if (intervalID != null) {
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




function getFile(event) {
  const input = event.target
  if ('files' in input && input.files.length > 0) {
    parseKeyFileContent(input.files[0])
  }
}


    //String should be all caps 24 chars long and with no numbers
function isStringAGoodTokenString( inputString) {

  if (/^[A-Z]+$/.test(inputString))
  {
    if (inputString.length == 24)
    {
      return true;
    }
    else
    {
      set_error("Token recieved from server incorrect length");
      return false;
    }
    
  }
  else
  {
    set_error("Token recieved from server incorrect format");
    return false;
  }
  }


// the key file should be private key, public key, and chat id
function parseKeyFileContent(file) {
  readFileContent(file).then(content => {
    var parts = content.split(",");
    if (parts.length == 3) {
      local_key_pair.privateKey = convert_uint8bit_array_to_hex_array(parts[0]);
      local_key_pair.privateKey = convert_uint8bit_array_to_hex_array(parts[1]);
      change_chat_id(parts[2]);
      get_token();

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

// write a wrapper to abstract the ajax
function ajax_wapper(url, good_result_func, bad_result_func) {
  var xmlhttp = new XMLHttpRequest();


  xmlhttp.onreadystatechange = function () {
    if (this.readyState == 4 && this.status == 200) {
      good_result_func(this);
    }
    else if (this.readyState == 4) {
      bad_result_func(this);
    }
  };

  xmlhttp.open("GET", url, true);
  xmlhttp.send();
}



function get_token(follow_on_action)
{
  set_status("Getting Authentication Token for " +chat_id );
  ajax_wapper("/api/gettoken/"+chat_id, function (data) {

    var server_text = data.responseText;
    if(server_text.startsWith("fail:"))
    {
      set_error("Failed to get token from server");
      console.error(server_text);
      return;
    }
    var parts = server_text.split(":");

    if(parts.length != 2)
    {
      set_error("Failed to get token from server");
      console.error(server_text);
      return;
    }

    var enc_token =  parts[1];

    token = decrypt(enc_token);
    if(! isStringAGoodTokenString( token))
    {
      token = null;
    }
    else if (follow_on_action === 'function')
    {
      follow_on_action();
    }


  }, function (data) {
    set_error("Recived error code " + data.status + " when trying to fetch /api/gettoken/"+chat_id);
   });
  token
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

  ajax_wapper("/api/pubkeys", function (data) {
    distant_end_chat_ids = JSON.parse(data.responseText);
    set_status("making buttons");
    build_user_buttons();
    set_status("");
  }, function (data) {
    set_error("Recived error code " + data.status + " when trying to fetch /api/pubkeys");
   });

}

function build_user_buttons(search_text = null) {
  document.getElementById("chat_id_list").innerHTML = "";
  //console.log(distant_end_chat_ids)

  for (var ii = 0; ii < distant_end_chat_ids.length; ii++) {
    var user = distant_end_chat_ids[ii];
    if ((search_text == null) || (search_text != null && user.chatid.toLowerCase().includes(search_text.toLowerCase()))) {
      document.getElementById("chat_id_list").innerHTML = document.getElementById("chat_id_list").innerHTML +
        "<li><button class=\"add-button\" id=\"change_dist_id_to_" + user.chatid + "\"" +
        " onclick=\"set_dist_end(\'" + user.chatid + "\' , \'" + user.pubkeyhexstr + "\')\" >" + user.chatid + "</button> </li>";
    }

  }

}

// takes encrypted hex string converts it to a 8bit array, decrypts, converts it back to a string
function decrypt(enc_text)
{ 
  var output;
  var conv_enc_text = convert_hex_array_to_uint8bit_array(enc_text);
  (async () =>{ output =   await  ntru.decrypt(conv_enc_text, local_key_pair.privateKey);
    return text_decoder.decode(output);
  })();
  
}

// takes a sting and pub key, converts the string to an 8 bit array, encrypts the 8bit array, converys the 8bit array to a hexstring
function encrypt(plain_text, public_key)
{
  var output;
  (async () =>{ output =   await  ntru.decrypt(text_encoder.encode(plain_text), public_key );})();
  return convert_uint8bit_array_to_hex_array(output);
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
  dist_id = new_chat_id;
  document.getElementById("chattingtospan").innerHTML = new_chat_id;
  load_messages();
}


//load your keys or generate new ones
function load_change_local_end() {
  document.getElementById("main").innerHTML = "<h3>Change your chat id, generate new keys, or load offline keys:<h3>" +
    "<h4>Note your keys will be created locally in your browser, your private key will not be set to the server</h4>" +
    "<p>Chat Id:" +
    "<input type=\"text\" id=\"chat_id_local_user\" >" +
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
    "<textarea id=\"message_to_send\" rows=\"4\" cols=\"50\"></textarea>" +
    "<button class=\"add-button\" id=\"send_message\" onclick=\"send_message()\">Send</button>" +
    "</p>";
}

// adds one message to display
function add_message_to_display(toid, fromid, message_str)
{
  Document.getElementById("messages_list").innerHTML = Document.getElementById("messages_list").innerHTML + "<li>"+toid+":"+fromid+":"+message_str +"</li>";
}

function add_message_to_holder(toid, fromid, message_str)
{
  message_holder.push({
    "toid": toid,
    "fromid": fromid ,
    "message": message_str
  });
  add_message_to_display(toid, fromid, message_str);
}

function time_in_milliseconds()
{
  var d = new Date();
  return d.getTime();
}

// ///sendmessage/:tochatid/:fromchatid/:messagetosend/:token

function send_message_worker(enc_text, plain_text)
{
  ajax_wapper("/api/sendmessage/"+dist_id+"/"+chat_id+"/"+enc_text+"/"+token, 
  function (data) {
    var server_text = data.responseText;
    if(server_text == "success")
    {
      add_message_to_holder(dist_id, chat_id, plain_text);
    }
    else
    {
      set_error("Failed to send");
    }
  }, function (data) {
    set_error("Recived error code " + data.status + " when trying to fetch /api/sendmessage");
   });
}

function send_message()
{
  var plain_text = document.getElementById("message_to_send").value;
  var enc_text =   encrypt(document.getElementById("message_to_send").value,distant_key);

  if (token == null){
    // get a token then send the message 
    get_token(send_message_worker(enc_text, plain_text));
  }
  else
  {
    send_message_worker(enc_text, plain_text);
  }
}


function pull_message_worker()
{
  var ajax_string;
  if(last_pull_time == null)
  { // // /messages/:chatid/:token
    ajax_string = "/api/messages/"+chat_id+"/"+token;
  }
  else
  { // // /messagesaftertime/:chatid/:time/:token
    ajax_string = "/api/messagesaftertime/"+chat_id+"/"+ last_pull_time+"/"+token;
  }

  ajax_wapper(ajax_string, 
  function (data) {
    var message_array = JSON.parse(data.responseText);
    for(var ii =0; ii < message_array.length; ii++)
    {
      
      add_message_to_holder(message_array[ii]["toid"], message_array[ii]["fromid"], decrypt(message_array[ii]["encmessagehexstr"]));
    }
  }, function (data) {
    set_error("Recived error code " + data.status + " when trying to fetch messages");
   });

}

function pull_message()
{
  if (token == null){
    // get a token then send the message 
    get_token(send_message_worker(enc_text, plain_text));
  }
  else
  {
    send_message_worker(enc_text, plain_text);
  }

}


// /changechatid/:oldchatid/:newchatid/:token
function change_chat_id_worker(new_chat_id)
{

  ajax_wapper("/api/changechatid/"+chat_id+"/"+new_chat_id+"/"+token, function (data) {
    var server_text = data.responseText;
    if(server_text == "chatid changed")
    {
      set_status("Changed chat id from "+chat_id + " to " + new_chat_id);
      change_chat_id(new_chat_id);
    }
    else if(server_text == "bad server token")
    {
      set_error("Failed changing chat id, bad server token");
    }
    else
    {
      set_error("Failed changing chat id");
      console.error(server_text);
    }
  
  }, function (data) {
    set_error("Recived error code " + data.status + " when trying to fetch /api/changechatid/");
   });

}


// changes the chat id of the local user and sends to the server
function change_chat_id_and_publish() {
  var new_chat_id = document.getElementById("chat_id_local_user").value;

  if (token == null){
    // get a token then change chat id
    get_token(change_chat_id_worker(new_chat_id));
  }
  else
  {
    change_chat_id_worker(new_chat_id);
  }
}

// sends the value of local_key_pair.publicKey and chat_id to the server
// gets a token in the process
function publish_keys() {

  ajax_wapper("/api/publishpubkey/"+chat_id+"/"+convert_uint8bit_array_to_hex_array(local_key_pair.publicKey), function (data) {
   var  server_text = data.responseText;

    if(server_text.startsWith("good:"))
    {
      var parts = server_text.split(":");

      if(parts.length != 2)
      {
        set_error("Failed to get token from server");
        console.error(server_text);
        return;
      }
  
      var enc_token =  parts[1];
  
      token = decrypt(enc_token);
      if( isStringAGoodTokenString( token))
      {
        // send the token back to the server to verifiy key
            // /verifykey/:chatid/:token
            ajax_wapper("/api/verifykey/"+chat_id+"/"+token, function (data) {
              var server_text = data.responseText;
              if(server_text.startsWith("fail:"))
              {
                set_error("failed to verify keys "+ server_text);
              }
              else
              {
                set_status("Keys published for "+ chat_id);
              }
            }, function (data) {
              set_error("Recived error code " + data.status + " when trying to fetch /api/verifykey/");
             });


      }
      else
      {
        token = null;
        set_error("Token decryption failed");

      }

    }
    else if(server_text.startsWith("fail:"))
    {
      set_error("Failed to fetch token " + server_text);
    }


  }, function (data) {
    set_error("Recived error code " + data.status + " when trying to fetch /api/publishpubkey/");
   });
}



// from https://gist.github.com/6174/6062387
function make_uuid_string() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// changes the chat id of the local user and sends to the server
function make_new_keys() {

  set_status("Generating Keys");
  (async () => { local_key_pair = await ntru.keyPair(); 
    //set_status("Keys Generated");
    publish_keys();
  
  })();
  //console.log(local_key_pair);
  //set_status("Keys Generated");
  //publish_keys();
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
  for (var ii = 0; ii < input_key.length; ii++) {
    // operation
    output_hex_str = output_hex_str + input_key[ii].toString(16);
  }
  return output_hex_str;
}

function convert_hex_array_to_uint8bit_array(input_hex_str) {
  var bytes = new Uint8Array(Math.ceil(input_hex_str.length / 2));
  for (var i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(input_hex_str.substr(i * 2, 2), 16);
  }
  return bytes;
}





// save the keyfile
// private key, public key, chatid
function save_keyfile() {
  console.log(local_key_pair.privateKey);
  console.log(local_key_pair.publicKey);

  var text_to_be_saved = convert_uint8bit_array_to_hex_array(local_key_pair.privateKey) + "," + convert_uint8bit_array_to_hex_array(local_key_pair.publicKey) + "," + chat_id;
  download("werewolfchat.keys", text_to_be_saved);
}


// save the messages
function save_messages() {
  var millis = time_in_milliseconds();
  download("messages_"+millis+"_.txt", message_holder);

}

// initiallize the page with a random chat id
window.onload = function () {

  make_new_keys();
  change_chat_id("newuser" + make_uuid_string());
  keys_published = false;
  load_change_local_end();
};


