
const net   = require( "net" );
const dgram = require( "dgram" );

const mycmn = require( "./common.js" );


var argInd = 2;
var argsCount = process.argv.length - argInd;
var cwd = process.argv[1];

if ( argsCount < 5 )
{
    console.error( "Usage: proto listen.IP listen.port dest.IP dest.port [msg]" );

    return;
}

var trans_proto = process.argv[argInd + 0].toLowerCase();

var local_ip = process.argv[argInd + 1];
var local_port = parseInt( process.argv[argInd + 2] );

var dst_ip = ( argsCount >= 5 ) ? process.argv[argInd + 3] : null;
var dst_port = ( argsCount >= 5 ) ? parseInt( process.argv[argInd + 4] ) : null;
var send_msg = ( argsCount >= 6 ) ? process.argv[argInd + 5] : null;


console.log( send_msg );

mycmn.emitRTP( trans_proto, local_ip, local_port, dst_ip, dst_port, send_msg );