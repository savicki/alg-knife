
// TODO: port to python

const net   = require( "net" );
const dgram = require( "dgram" );
const fs    = require( "fs" );

const mycmn = require( "./common.js" );



function printUsage()
{
    console.error( 
"usage: trans_proto dst_ip dst_port send_msg 'rep: ' 'delay: ' 'wmap: ' 'rmap: '\n\n\
 UDP - send and/or recv data to/from remote host and keep socket open until exit\n\
 TCP - [send and/or recv and] stay connected until exit\n\n\
 send_msg - prefix '\\x' to send raw bytes, 'file: filename.ext' to send text file\n\
            'filehex: filename.hex' to send hex stream from file" );
}

// tcp 127.0.0.1 9001 "\x0000" "rep: 3" "delay: 2" "wmap: "  "rmap: "
// "\x000000" / "filehex: sccp_tcp_smt.hex"    "wmap: sccp_tcp_smt.wmap" "rmap: sccp_tcp_smt.rmap"
// "abc" / "filetxt: sip_invite.txt"           "rmap: sip_invite.rmap"


// "rtp: {{rtp_proto}} {{local_ip}} {{iter_num+1024}} {{rtp_remote_ip}} {{rtp_remote_port}} emit_data"

var args = mycmn.parseArgs( process.argv, printUsage );

if ( !args )
    return;

var trans_proto     = args["proto"];
var dst_ip          = args["ip"];
var dst_port        = args["port"];
// var send_data       = process.argv[argInd + 3];

var send_repeat      = args["rep"] || 1;
var send_delay_sec   = args["delay"] || 0;



var env = mycmn.getEnv();

var sendComp = null, recvComp = null;


var isHexMode;
{
    isHexMode = args.sendData.isHex;

    // compile send data
    if ( isHexMode )
    {
        var writeMap = args["wmap"] ? fs.readFileSync( args["wmap"] ) : "";
        
        sendComp = mycmn.compileBuf( false /* !recv */, args.sendData.buffer, writeMap /* hex */ );
    }
    else
    {
        sendComp = mycmn.compileBuf( false /* !recv */, args.sendData.buffer, null /* !hex */ );
    }

    // compile recv data
    if ( args["rmap"] )
    {
        var readMap = fs.readFileSync( args["rmap"] );

        if ( isHexMode )
        {
            recvComp = mycmn.compileBuf( true /* recv */, null, readMap /* hex */ );
        }
        else
        {
            recvComp = mycmn.compileBuf( true /* recv */, readMap, null /* !hex */ );
        }
    }   
}

env.update(
{
    "proto" : trans_proto,
    "remote_ip" : dst_ip,
    "remote_port" : dst_port,
});

// send hex/txt
var sendData = mycmn.runBuf( sendComp, env, null /* no recv buffer */ );
console.log( sendData.toString( isHexMode ? "HEX" : "" ) )

//var recvData = fs.readFileSync( "./samples/SIP/sip_tcp_invite.txt" );
//var recvData = fs.readFileSync( "./samples/sccp/sccp_smt.hex" );
// recv txt
if ( recvComp ) // verify MSG and/or update ENV vars
{
    recvData = mycmn.runBuf( recvComp, env, recvData /* recvData, bytes */ );
    console.log( recvData.toString( isHexMode ? "HEX" : "" ) )
}
env.print();

return;



var tcp_client = null;
var udp_client = null;
var timer = null;

if ( trans_proto == "tcp" )
{
    tcp_client = new net.Socket();

    tcp_client.connect( dst_port, dst_ip, function() 
    {
        mycmn.updateEnvVars( env,
        {
            "local_ip" : tcp_client.localAddress,
            "local_port" : tcp_client.localPort,
        });

        console.log( "[tcp] connected [to %s:%s] [from %s:%s]", 
            dst_ip, dst_port, tcp_client.localAddress, tcp_client.localPort );

        //mycmn.printEnvVars( env );

        var ind = 0;

        var doTcpSend = function()
        {
            mycmn.updateEnvVars( env,
            {
                "iter_num" : ind
            });

            //mycmn.printEnvVars( env );
            
            var sendBuff = mycmn.runSendBuf( sendBuffCompiled, env );

            tcp_client.write( sendBuff, function()
            {
                console.log( "[tcp] sent>'%s' [%s-th msg] [%s bytes] [to %s:%s]", 
                    sendBuff.toString(), ind + 1, sendBuff.length, dst_ip, dst_port );

                if ( ++ind < send_repeat )
                {
                    timer = setTimeout( doTcpSend, send_delay_sec * 1000 );
                }
                // don't exit after send all. At least, to recv all data
                // else
                // {
                //     tcp_client.close();
                // }
            });
        }

        if ( sendBuffCompiled )
        {
            doTcpSend();
        }
    });

    tcp_client.on( "data", function( msg )
    {
        console.log( "[tcp] recv>'%s' [%s bytes] [from %s:%s]",
            msg.toString(), msg.length, dst_ip, dst_port);
    });

    tcp_client.on( "close", function()
    {
        console.log( "[tcp] connection closed" );
    });

    tcp_client.on( "error", function()
    {
        console.log( "[tcp] connection error" );
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

    var doUdpSend = function()
    {
        udp_client.send( send_buff, 0, send_buff.length, dst_port, dst_ip, function()
        {
            console.log( "[udp] sent>'%s' [%s-th msg] [%s bytes] [to %s:%s]", 
                send_buff.toString(), ind + 1, send_buff.length, dst_ip, dst_port );

            if ( ++ind < send_repeat )
            {
                timer = setTimeout( doUdpSend, send_delay_sec * 1000 );
            }
            // don't exit after send all. At least, to recv all data
            // else
            // {
            //     udp_client.close();
            // }
        });
    }

    doUdpSend();
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
        tcp_client.destroy();

    if ( udp_client )
        udp_client.close();
});