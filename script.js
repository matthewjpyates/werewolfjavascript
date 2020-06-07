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
var message_holder = [];
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
  intervalID = window.setInterval(pull_message_worker, 1500);
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
      local_key_pair.privateKey = convert_to_javascript_format_from_java(parts[0]);
      local_key_pair.publicKey = convert_to_javascript_format_from_java(parts[1]);
      change_chat_id(parts[2]);
      stop_pulling_messages();
      get_token(function(){ start_pulling_messages();});

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

    decrypt(enc_token, function(decrypted){
      if(! isStringAGoodTokenString( decrypted))
      {
        console.log("token failed with " + decrypted);
        token = null;
      }
      else if (follow_on_action === 'function')
      {
        token = decrypted;
        console.log("leaving get_token and the token is " + token);
        follow_on_action();
      }

    } );



  }, function (data) {
    set_error("Recived error code " + data.status + " when trying to fetch /api/gettoken/"+chat_id);
   });
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

function decrypt(enc_text, follow_on_action)
{

  (async () => { 
    var conv_enc_text = convert_hex_array_to_uint8bit_array(enc_text);
    console.log("encrypted " +conv_enc_text);
    var plain_text = await ntru.decrypt(conv_enc_text, local_key_pair.privateKey);
    console.log("decrypted " +plain_text);
   console.log("decoded plain text "+ text_decoder.decode(plain_text));

    follow_on_action(    text_decoder.decode(plain_text));
    
  
  })();

}




function encrypt(plain_text, follow_on_action)
{
//await ntru.encrypt(text_encoder.encode("test"), local_key_pair.publicKey);
  (async () => { 
    console.log("plain text " +plain_text);
    console.log("distant pub key as a u8bitarray " +distant_key);
    //var temp_key =     convert_to_javascript_format_from_java(distant_key);
    //console.log("distant pub key as in array " +temp_key);


    var conv_enc_text = await  ntru.encrypt(text_encoder.encode(plain_text), distant_key);
    var temp = convert_uint8bit_array_to_hex_array(conv_enc_text)
    //convert_hex_array_to_uint8bit_array(enc_text);
    console.log("encrypted hex array" +temp);
  

    follow_on_action(temp);
    
  
  })();

}


// reduces the size of returned chat ids to only chat ids that contain the string that is in the search textbox
function search_field_input() {
  var search_text = document.getElementById("search_text").value;
  build_user_buttons(search_text);
}


// set distant end
// gets passed in as a hex string need to convert to unsigned 8bit int array
function set_dist_end(new_chat_id, pub_key) {
  distant_key = convert_to_javascript_format_from_java(pub_key);
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
  document.getElementById("messages_list").innerHTML = document.getElementById("messages_list").innerHTML + "<li>"+toid+":"+fromid+":"+message_str +"</li>";
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
  console.log("plain_text is " +plain_text );
  console.log("distance_key is in send message is" +distant_key );
  encrypt(document.getElementById("message_to_send").value, function (encrypted_hex){

    console.log("token is " +token );

    if (token == null){
      // get a token then send the message 
      get_token(send_message_worker(encrypted_hex, plain_text));
    }
    else
    {
      send_message_worker(encrypted_hex, plain_text);
    }

  });

  
}


function pull_message_worker()
{
  console.log("in pull messages");
  if (token == null){
    console.log("in pull messages token null");

  return;
  }
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
    console.log("from server " +data.responseText);
    last_pull_time = time_in_milliseconds();
    var message_array = JSON.parse(data.responseText);
    for(var ii =0; ii < message_array.length; ii++)
    {
     // var message_obj = JSON.parse(message_array[ii]);
     // console.log("from server " +Object.keys(message_array[ii]));
      var toChatId = message_array[ii]["toid"];
      var fromChatId = message_array[ii]["fromid"];

      decrypt(message_array[ii]["encmessagehexstr"],function(plain_text_message)
      {
        add_message_to_holder(toChatId, fromChatId, plain_text_message);

      });
      
      
    }
  }, function (data) {
    set_error("Recived error code " + data.status + " when trying to fetch messages");
   });

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

  
  console.log("here is the pubkey");
  console.log(local_key_pair.publicKey.toString());
  console.log("here is the privkey");
  console.log(local_key_pair.privateKey.toString());
 /* console.log("here is the privkey");
  console.log(local_key_pair.privateKey.toString());
  console.log("/api/publishpubkey/"+chat_id+"/"+convert_uint8bit_array_to_hex_array(local_key_pair.publicKey));
  console.log("/api/publishpubkey/"+chat_id+"/"+bytesToHex(local_key_pair.publicKey));
  console.log("/api/publishpubkey/"+chat_id+"/"+toHexString(local_key_pair.publicKey));
*/
  
  //var temp_key = [].slice.call( local_key_pair.publicKey);

  var temp_key  = convert_to_java_format_from_javascript(local_key_pair.publicKey);
 
  console.log(temp_key);
  //temp_key.splice(0,5);
  //console.log(temp_key);
 // ajax_wapper("/api/publishpubkey/"+chat_id+"/043F0800"+toHexString(new Uint8Array(temp_key)), function (data) {
  ajax_wapper("/api/publishpubkey/"+chat_id+"/"+temp_key, function (data) {
   var  server_text = data.responseText;

    if(server_text.startsWith("good:"))
    {
      console.log(server_text);
      var parts = server_text.trim().split(":");

      if(parts.length != 2)
      {
        set_error("Failed to get token from server");
        console.error(server_text);
        return;
      }
  
      var enc_token =  parts[1];

      console.log(enc_token);
  
      //token = decrypt(enc_token);
      decrypt(enc_token, function (input_token){
        console.log("1 global token is " + token); 

        console.log("1 local token is " + input_token);

        if( isStringAGoodTokenString( input_token))
        {
          // send the token back to the server to verifiy key
              // /verifykey/:chatid/:token
              ajax_wapper("/api/verifykey/"+chat_id+"/"+input_token, function (data) {
                var server_text = data.responseText;
                if(server_text.startsWith("fail:"))
                {
                  set_error("failed to verify keys "+ server_text);
                  token = null;
                }
                else
                {
                  set_status("Keys published for "+ chat_id);
                  token = input_token;
                  console.log("2 global token is " + token); 

                  console.log("2 local token is " + input_token);
                  start_pulling_messages();
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


      });
      console.log("here")
     

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
    console.log(local_key_pair);
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

function convert_uint8bit_array_to_hex_array(input_key_uint8bit) {
  var input_key = [].slice.call(input_key_uint8bit);
  output_hex_str = ""
  for (var ii = 0; ii < input_key.length; ii++) {
    // operation
    if(input_key[ii]<16)
    {output_hex_str = output_hex_str + '0';}
    output_hex_str = output_hex_str + input_key[ii].toString(16);
  }
  return output_hex_str.toUpperCase();
}

function convert_hex_array_to_uint8bit_array(input_hex_str) {
  var bytes = new Uint8Array(Math.ceil(input_hex_str.length / 2));
  for (var i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(input_hex_str.substr(i * 2, 2), 16);
  }
  return bytes;
}

var HEX_ARRAY = ['0','1','2','3','4','5','6','7','8','9','A','B','C','D','E','F'];

function bytesToHex( inputbytes) {
  var bytes = [].slice.call(inputbytes);

    var hexChars = [];
    for (var j = 0; j < bytes.length; j++) {
        var v = bytes[j] & 0xFF;
        hexChars[j * 2] = HEX_ARRAY[v >>> 4];
        hexChars[j * 2 + 1] = HEX_ARRAY[v & 0x0F];
    }
    var output = hexChars.join('');
    //output.reverse();
    return output;
}

function toHexString(byteArrayInput) {
  var byteArray = [].slice.call(byteArrayInput);

  return Array.from(byteArray, function(byte) {
    return ('0' + (byte & 0xFF).toString(16)).slice(-2);
  }).join('').toUpperCase();
}


// save the keyfile
// private key, public key, chatid
function save_keyfile() {
  console.log(local_key_pair.privateKey);
  console.log(local_key_pair.publicKey); 

  var text_to_be_saved = convert_to_java_format_from_javascript(local_key_pair.privateKey) + "," + convert_to_java_format_from_javascript(local_key_pair.publicKey) + "," + chat_id;
  download("werewolfchat.keys", text_to_be_saved);
}


// save the messages
function save_messages() {
  var millis = time_in_milliseconds();
  download("messages_"+millis+"_.txt", message_holder);

}

// initiallize the page with a random chat id
window.onload = function () {

  change_chat_id("newuser" + make_uuid_string());
  make_new_keys();
  keys_published = false;
  load_change_local_end();
};


function remove_element_from_array_at_index(input_array, index_to_remove) 
{

if (index_to_remove > -1) {
  var arr = Array.from(input_array);

  arr.splice(index_to_remove, 1);
}
return arr;
}

function add_element_to_array_at_index(input_array, index_to_add_at, value_to_add)
{
  if (index_to_add_at > -1) {
    var arr = Array.from(input_array);
    arr.splice(index_to_add_at, 0, value_to_add);
  }
  return arr;
}


//removes the second byte from the uint8bit and turns to hex array
function convert_to_java_format_from_javascript(input_array) {
  return convert_uint8bit_array_to_hex_array(remove_element_from_array_at_index(input_array, 1));
}


//converts to uint8bit and adds the value 3 at the 2 postition (index 1)
function convert_to_javascript_format_from_java(input_array) {
  var arr = convert_hex_array_to_uint8bit_array(input_array.toString());
  //var arr = Array.from(input_string);
  return add_element_to_array_at_index(arr, 1, 3);

}
