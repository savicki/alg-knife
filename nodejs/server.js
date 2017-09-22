
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
"usage: trans_proto listen_ip listen_port [reply_msg [reply_delay=0]]\n\n\
 reply_msg - prefix '\\x' to send raw bytes, 'file: filename.ext' to send text file\n\
            'filehex: filename.hex' to send hex stream from file" );
}

if ( argsCount < 3 )
{
    printUsage();
    return;
}

var trans_proto = process.argv[argInd + 0].toLowerCase();
var listen_ip = process.argv[argInd + 1];
var listen_port = parseInt(process.argv[argInd + 2]);

// data to send, mandatory for UDP
var send_data       = ( argsCount >= 4 ) ? process.argv[argInd + 3] : null;
var send_delay_sec   = ( argsCount >= 6 ) ? parseInt(process.argv[argInd + 4]) : 0;


var send_buff = ( send_data ) ? mycmn.getSendBuf( cwd, send_data ) : null;

if ( send_data && !send_buff )
    return;

// TODO: -v support

var tcp_server = null;
var tcp_clients = {};
var udp_server = null;
var timer = null;

if ( trans_proto == "tcp" )
{
    tcp_server = net.createServer( function( tcp_client )
    {
        // linux: fix socket.close event issue where socket's fields are undefined
        var remoteAddress = tcp_client.remoteAddress;
        var remotePort = tcp_client.remotePort;

        console.log( "[tcp] connected [from %s:%s]", remoteAddress, remotePort );

        tcp_clients[remoteAddress + ":" + remotePort] = socket;

        tcp_client.on( "data", function( msg ) 
        {
            console.log( "[tcp] recv>'%s' [%s bytes] [from %s:%s]", 
                msg.toString(), msg.length, remoteAddress, remotePort );

            if ( send_buff != null )
            {
                timer = setTimeout(function()
                {
                    tcp_client.write( send_buff, function()
                    {
                        console.log( "[tcp] sent>'%s' [%s bytes] [to %s:%s]", 
                            send_buff.toString(), send_buff.length, remoteAddress, remotePort );

                        //udp_client.close();
                    });

                }, send_delay_sec * 1000 );
            }            
        });
        
        tcp_client.on( "close", function() 
        {
            console.log( "[tcp] disconnected [from %s:%s]", remoteAddress, remotePort );

            delete tcp_clients[remoteAddress + ":" + remotePort];
        });
    });

    tcp_server.listen( listen_port, listen_ip );
}
else if ( trans_proto == "udp" )
{
    udp_server = dgram.createSocket( "udp4" )

    udp_server.on( "listening", function()
    {
        console.log( "[udp] listening on %s:%s", listen_ip, listen_port );
    })

    udp_server.on( "message", function( msg, from )
    {
        console.log( "[udp] recv>'%s' [%s bytes] [from %s:%s]", 
            msg.toString(), msg.length, from.address, from.port );

        //udp_client = dgram.createSocket( "udp4" );

        if ( send_buff != null )
        {
            timer = setTimeout(function()
            {
                udp_server.send( send_buff, 0, send_buff.length, from.port, from.address, function()
                {
                    console.log( "[udp] sent>'%s' [%s bytes] [to %s:%s]", 
                        send_buff.toString(), send_buff.length, from.address, from.port );

                    //udp_client.close();
                });

            }, send_delay_sec * 1000 );
        }
    })

    udp_server.bind( listen_port, listen_ip );
}
else
{
    console.error( "wrong proto '%s', must be TCP/UDP, exit", trans_proto );
}


process.on('SIGINT', function() 
{
    console.log( "Caught interrupt signal" );

    var keys = Object.keys( tcp_clients );
    for( var i = 0; i < keys.length; i++ )
    {
        var client_socket = tcp_clients[ keys[i] ];
        client_socket.destroy();
    }

    if ( timer )
        clearTimeout( timer );

    if ( tcp_server )
        tcp_server.close();

    if ( udp_server )
        udp_server.close();
});