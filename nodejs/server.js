
// TODO: port to python

const net   = require( "net" );
const dgram = require( "dgram" );
const fs    = require( "fs" );

const mycmn = require( "./common.js" );



function printUsage()
{
    console.error( 
"usage: trans_proto listen_ip listen_port [reply_msg [reply_delay=0]]\n\n\
 reply_msg - prefix '\\x' to send raw bytes, 'file: filename.ext' to send text file\n\
            'filehex: filename.hex' to send hex stream from file" );
}


var args = mycmn.parseArgs( process.argv, printUsage );

if ( !args )
    return;


var trans_proto     = args["proto"];
var listen_ip       = args["ip"];
var listen_port     = args["port"];
var send_repeat     = args["rep"] || 1;
var send_delay_sec  = args["delay"] || 0;


mycmn.setVerbose( args["v"] != undefined );
var env = mycmn.getEnv();

var cInfo = mycmn.compileBufs( args );
var sendComp = cInfo.sendComp;
var recvComp = cInfo.recvComp;

var isHexMode = args.sendData.isHex;


env.update(
{
    "proto"     : trans_proto,
    "local_ip"  : listen_ip,
    "local_port" : listen_port,
    "is_client" : 0
});

var rtpTmpl = args["rtp"] ? mycmn.parseRTParg( args["rtp"] ) : null;



var tcp_control = net.createServer( function( tcp_client )
{
    tcp_client.on( "error", function() 
    {
    });
});
tcp_control.listen( mycmn.CONTROL_PORT, listen_ip );


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

        tcp_clients[remoteAddress + ":" + remotePort] = tcp_client;

        env.update(
        {
            "remote_ip" : remoteAddress,
            "remote_port" : remotePort,
        });

        var ind = 0;

        tcp_client.on( "data", function( msg ) 
        {
            env.update(
            {
                "iter_num" : ind++
            });

            console.log( "[tcp] recv>'%s' [%s bytes] [from %s:%s]", 
                msg.toString( isHexMode ? "HEX" : "" ), msg.length, remoteAddress, remotePort );

            if ( recvComp ) // verify MSG and/or update ENV vars
            {
                msg = mycmn.runBuf( recvComp, env, msg /* recvData, bytes */ );

                env.print( "** After recv:" );
            }


            //if ( sendComp != null )
            {
                //timer = setTimeout(function()
                {
                    var sendData = mycmn.runBuf( sendComp, env );

                    env.print( "** Before send:" );

                    tcp_client.write( sendData, function()
                    {
                        console.log( "[tcp] sent>'%s' [%s bytes] [to %s:%s]", 
                            sendData.toString( isHexMode ? "HEX" : "" ), sendData.length, remoteAddress, remotePort );

                        if ( rtpTmpl )
                        {
                            var rtpInfo = mycmn.getRTPinfo( env, rtpTmpl );

                            mycmn.emitRTP2( rtpInfo, send_delay_sec - 1 );
                        }
                    });

                }//, send_delay_sec * 1000 );
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
    var ind = 0;

    udp_server = dgram.createSocket( "udp4" )

    udp_server.on( "listening", function()
    {
        console.log( "[udp] listening on %s:%s", listen_ip, listen_port );
    })

    udp_server.on( "message", function( msg, from )
    {
        env.update(
        {
            "remote_ip"   : from.address,
            "remote_port" : from.port
        });

        console.log( "[udp] recv>'%s' [%s bytes] [from %s:%s]", 
            msg.toString( isHexMode ? "HEX" : "" ), msg.length, from.address, from.port );

        if ( recvComp ) // verify MSG and/or update ENV vars
        {
            msg = mycmn.runBuf( recvComp, env, msg /* recvData, bytes */ );

            env.print( "** After recv:" );
        }

        //if ( send_buff != null )
        {
            //timer = setTimeout(function()
            {
                env.update(
                {
                    "iter_num" : ind++
                });

                var sendData = mycmn.runBuf( sendComp, env );

                env.print( "** Before send:" );

                udp_server.send( sendData, 0, sendData.length, from.port, from.address, function()
                {
                    console.log( "[udp] sent>'%s' [%s bytes] [to %s:%s]", 
                        sendData.toString( isHexMode ? "HEX" : "" ), sendData.length, from.address, from.port );

                    if ( rtpTmpl )
                    {
                        var rtpInfo = mycmn.getRTPinfo( env, rtpTmpl );

                        mycmn.emitRTP2( rtpInfo, send_delay_sec - 1 );
                    }
                });

            }//, send_delay_sec * 1000 );
        }
    })

    udp_server.bind( listen_port, listen_ip, function()
    {
    });
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

    if ( tcp_control )
        tcp_control.close();

    if ( tcp_server )
        tcp_server.close();

    if ( udp_server )
        udp_server.close();
});