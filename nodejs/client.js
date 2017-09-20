
// TODO: port to python

const net   = require( "net" );
const dgram = require( "dgram" );

const mycmn = require( "./common.js" );


var argInd = 2;
var argsCount = process.argv.length - argInd;
var cwd = process.argv[1];


function printUsage()
{
    console.error( 
"usage: trans_proto dst_ip dst_port [send_msg [send_count=1 [send_delay=0]]]\n\n\
 UDP - send/recv data from remote host and keep socket open until exit\n\
 TCP - [send/recv and] stay connected until CTRL+C\n\n\
 send_msg - prefix '\\x' to send raw bytes, 'file: filename.ext' to send text file\n\
            'filehex: filename.hex' to send hex stream from file" );
}

if ( argsCount < 3 )
{
    printUsage();
    return;
}

trans_proto = process.argv[argInd + 0]
dst_ip = process.argv[argInd + 1]
dst_port = parseInt(process.argv[argInd + 2])

// data to send, mandatory for UDP
send_data       = ( argsCount >= 4 ) ? process.argv[argInd + 3] : null;
// send amount
send_repeat      = ( argsCount >= 5 ) ? parseInt(process.argv[argInd + 4]) : 1;
send_delay_sec   = ( argsCount >= 6 ) ? parseInt(process.argv[argInd + 5]) : 0;

trans_proto = trans_proto.toLowerCase();

send_buff = ( send_data ) ? mycmn.getSendBuf( cwd, send_data ) : null;

if ( send_data && !send_buff )
    return;

// TODO: -v support
// TODO: send by chunks from arg, e.g. {10,14,28,14} for 66 bytes msg. Ring buffers will be happy.

var tcp_client = null;
var udp_client = null;
var timer = null;

if ( trans_proto == "tcp" )
{
    tcp_client = new net.Socket();

    tcp_client.connect( dst_port, dst_ip, function() 
    {
        console.log( "[tcp] connected to %s:%s", dst_ip, dst_port );
    });

    tcp_client.on( "data", function( data )
    {
        console.log( "recv> " + data );
    });

    tcp_client.on( "close", function()
    {
        console.log( "[tcp] connection closed" );
    });
}
else if ( trans_proto == "udp" )
{
    if ( send_buff == null )
    {
        console.error( "[udp] send data required, exit");
        return;
    }

    udp_client = dgram.createSocket( "udp4" );
    udp_client.on( "message", function( msg, from )
    {
        console.log( "[udp] recv>'%s' [%s bytes] [from %s:%s]", 
            msg.toString(), msg.length, from.address, from.port );
    });

    var ind = 0;

    var doSend = function()
    {
        udp_client.send( send_buff, 0, send_buff.length, dst_port, dst_ip, function()
        {
            console.log( "[udp] sent>'%s' [%s-th msg] [%s bytes] [to %s:%s]", 
                send_buff.toString(), ind + 1, send_buff.length, dst_ip, dst_port );

            if ( ++ind < send_repeat )
            {
                timer = setTimeout( doSend, send_delay_sec * 1000 );
            }
            // don't exit after send all. At least, to recv all data
            // else
            // {
            //     udp_client.close();
            // }
        });
    }

    doSend();
}
else
{
    console.error( "wrong proto '%s', must be TCP/UDP, exit", trans_proto );
}


process.on('SIGINT', function() 
{
    console.log( "Caught interrupt signal" );

    if ( timer )
        clearTimeout( timer );

    if ( tcp_client )
        tcp_client.close();

    if ( udp_client )
        udp_client.close();
});