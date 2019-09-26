
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

var trans_proto     = args["proto"] ? args["proto"].toLowerCase() : null;
var dst_ip          = args["ip"];
var dst_port        = args["port"];
var send_repeat_cnt = args["rep"] || 1;
var send_delay_sec  = args["delay"] || 0;
var forced_src_ip   = args["from"] || null;


mycmn.setVerbose( args["v"] != undefined );
var env = mycmn.getEnv();

var cInfo = mycmn.compileBufs( args );
var sendComp = cInfo.sendComp;
var recvComp = cInfo.recvComp;

var isHexMode = args.sendData.isHex;


env.update(
{
    "proto"     : trans_proto,
    "remote_ip" : dst_ip,
    "remote_port" : dst_port,
    "is_client" : 1
});

var rtpTmpl = args["rtp"] ? mycmn.parseRTParg( args["rtp"] ) : null;


//console.log( rtpTmpl ? mycmn.getRTPinfo( env, rtpTmpl ) : "no RTP info" );

// send hex/txt
//var sendData = mycmn.runBuf( sendComp, env, null /* no recv buffer */ );
//console.log( sendData.toString( isHexMode ? "HEX" : "" ) )

//var recvData = fs.readFileSync( "./samples/SIP/sip_tcp_invite.txt" );
//var recvData = fs.readFileSync( "./samples/sccp/sccp_smt.hex" );
// recv txt
//if ( recvComp ) // verify MSG and/or update ENV vars
//{
//    recvData = mycmn.runBuf( recvComp, env, recvData /* recvData, bytes */ );
//    console.log( recvData.toString( isHexMode ? "HEX" : "" ) )
//}
//env.print();


function work_do(tcp_ctrl_local_ip)
{
    env.update(
    {
        "local_ip" : tcp_ctrl_local_ip
    });


    if ( trans_proto == "tcp" )
    {
        tcp_client = new net.Socket();

        tcp_client.connect( dst_port, dst_ip, function() 
        {
            env.update(
            {
                "local_port" : tcp_client.localPort,
            });

            console.log( "[tcp] connected [to %s:%s] [from %s:%s]", 
                dst_ip, dst_port, tcp_client.localAddress, tcp_client.localPort );

            var ind = 0;

            var doTcpSend = function()
            {
                if ( ind == send_repeat_cnt )
                    return;

                env.update(
                {
                    "iter_num" : ind
                });

                console.log( mycmn.ITER_TMPL_HEAD, "tcp", ind );

                var sendData = mycmn.runBuf( sendComp, env );

                env.print( "** Before send:" );

                tcp_client.write( sendData, function()
                {
                    console.log( "[tcp] sent>'%s' [%s-th msg] [%s bytes] [to %s:%s]", 
                        sendData.toString( isHexMode ? "HEX" : "" ), ind + 1, sendData.length, dst_ip, dst_port );

                    if ( ind++ < send_repeat_cnt )
                    {
                        timer = setTimeout( doTcpSend, send_delay_sec * 1000 );
                    }
                });
            }

            if ( sendComp )
            {
                doTcpSend();
            }
        });

        tcp_client.on( "data", function( msg )
        {
            console.log( "[tcp] recv>'%s' [%s bytes] [from %s:%s]",
                msg.toString( isHexMode ? "HEX" : "" ), msg.length, dst_ip, dst_port);

            if ( recvComp ) // verify MSG and/or update ENV vars
            {
                msg = mycmn.runBuf( recvComp, env, msg /* recvData, bytes */ );

                if ( !msg ) return;
               
               env.print( "** After recv:" );

               if ( rtpTmpl )
               {
                    var rtpInfo = mycmn.getRTPinfo( env, rtpTmpl );

                    mycmn.emitRTP2( rtpInfo, send_delay_sec - 1, function()
                    {
                        console.log( mycmn.ITER_TMPL_FOOTER, "tcp" );
                    });
               }
               else
               {
                    console.log( mycmn.ITER_TMPL_FOOTER, "tcp" );
               }
            }
        });

        tcp_client.on( "close", function()
        {
            console.log( "[tcp] connection closed" );
        });

        tcp_client.on( "error", function()
        {
            console.log( "[tcp] connection error" );

            process.exit( 1 );
        });
    }
    else if ( trans_proto == "udp" )
    {
        if ( send_buff == null )
        {
            console.error( "*** [udp] send data required, exit");
            return;
        }

        udp_client = dgram.createSocket( "udp4" );
        
        udp_client.on( "message", function( msg, from )
        {
            console.log( "[udp] recv>'%s' [%s bytes] [from %s:%s]", 
                msg.toString( isHexMode ? "HEX" : "" ), msg.length, from.address, from.port );

            if ( recvComp ) // verify MSG and/or update ENV vars
            {
                msg = mycmn.runBuf( recvComp, env, msg /* recvData, bytes */ );

                if ( !msg ) return;

                env.print( "** After recv:" );

                if ( rtpTmpl )
                {
                    var rtpInfo = mycmn.getRTPinfo( env, rtpTmpl );

                    mycmn.emitRTP2( rtpInfo, send_delay_sec - 1, function()
                    {
                        console.log( mycmn.ITER_TMPL_FOOTER, "udp" );
                    });
                }
                else
                {
                    console.log( mycmn.ITER_TMPL_FOOTER, "udp" );
                }
            }
        });


        udp_client.bind(function()
        {
            env.update(
            {
                "local_port" : udp_client.address().port,
            });

            var ind = 0;

            var doUdpSend = function()
            {
                if ( ind == send_repeat_cnt )
                    return;

                env.update(
                {
                    "iter_num" : ind
                });

                console.log( mycmn.ITER_TMPL_HEAD, "udp", ind );

                var sendData = mycmn.runBuf( sendComp, env );

                if ( typeof( sendData ) == "string" )
                    sendData = new Buffer( sendData );

                env.print( "** Before send:" );

                udp_client.send( sendData, 0, sendData.length, dst_port, dst_ip, function()
                {
                    console.log( "[udp] sent>'%s' [%s-th msg] [%s bytes] [to %s:%s] [from %s:%s]", 
                        sendData.toString( isHexMode ? "HEX" : "" ), ind + 1, sendData.length, dst_ip, dst_port, env.local_ip, env.local_port );

                    if ( ind++ < send_repeat_cnt )
                    {
                        timer = setTimeout( doUdpSend, send_delay_sec * 1000 );
                    }
                });
            }

            doUdpSend();
        })
    }
    else
    {
        console.error( "*** wrong proto '%s', must be TCP/UDP, exit", trans_proto );
    }
}

var tcp_client = null;
var udp_client = null;
var timer = null;


var tcp_control = null;

if ( forced_src_ip && trans_proto == "udp" )
{
    /* don't open control connection, send UDP msg */
    work_do( forced_src_ip );
}
else
{
    tcp_control = new net.Socket();

    console.log("Connecting (ctrl)...");

    tcp_control.connect( mycmn.CONTROL_PORT, dst_ip, function() 
    {
        console.log("*******************" + tcp_control.localAddress + "*******************");

        work_do(tcp_control.localAddress);
    });

    tcp_control.on( "error", function() 
    {
    });
}

process.on('SIGINT', function() 
{
    console.log( "Caught interrupt signal" );

    if ( timer )
        clearTimeout( timer );

    if ( tcp_control )
        tcp_control.destroy();

    if ( tcp_client )
        tcp_client.destroy();

    if ( udp_client )
        udp_client.close();
});