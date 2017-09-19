
// TODO: python vers.

const net   = require( "net" );
const dgram = require( "dgram" );
const fs    = require( "fs" );

var argInd = 2;
var argsCount = process.argv.length - argInd;

function printUsage()
{
    console.error( 
"usage: trans_proto listen_ip listen_port [reply_msg [reply_delay=0]]\n\n\
 reply_msg - prefix '\\x' to reply raw bytes, 'file:filename.ext' to reply file" );
}

if ( argsCount < 3 )
{
    printUsage();
    return;
}

trans_proto = process.argv[argInd + 0]
listen_ip = process.argv[argInd + 1]
listen_port = parseInt(process.argv[argInd + 2])

// data to send, mandatory for UDP
send_data       = ( argsCount >= 4 ) ? process.argv[argInd + 3] : null;
send_delay_sec   = ( argsCount >= 6 ) ? parseInt(process.argv[argInd + 4]) : 0;


trans_proto = trans_proto.toLowerCase();

send_buff = null;
if ( send_data )
{
    const hexPrefix = "\\x";
    var hexPrefixLen = hexPrefix.length;

    const filePrefix = "file:";
    var filePrefixLen = filePrefix.length;  

    var isHex = 
        send_data.length > hexPrefixLen && 
        send_data.indexOf( hexPrefix ) == 0 &&
        send_data.length % 2 == 0;

    var isFile = 
        send_data.length > filePrefixLen && 
        send_data.indexOf( filePrefix ) == 0


    if ( isHex )
    {
        send_buff = new Buffer( send_data.substr( hexPrefixLen ), "hex" );
    }
    else if ( isFile )
    {
        var filename = send_data.substr( filePrefixLen );

        if ( fs.existsSync( filename ) )
        {
            send_buff = new Buffer( fs.readFileSync( filename ) );
        }
        else
        {
            console.error( "file '%s' not found, exit.", filename );
            return;
        }
    }
    else
    {
        send_buff = new Buffer( send_data );
    }

    console.log( "send_buff (hex): '%s'", send_buff.toString( "hex" ) )
    console.log( "send_buff (str): '%s'", send_buff.toString( ) )
}

// TODO: -v support

var tcp_server = null;
var udp_server = null;
var timer = null;

if ( trans_proto == "tcp" )
{
    tcp_server = net.createServer( function( socket )
    {
        console.log( "accept new TCP connection" );
    });

    tcp_server.listen( dst_port, dst_ip );
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

    if ( timer )
        clearTimeout( timer );

    if ( tcp_server )
        tcp_server.close();

    if ( udp_server )
        udp_server.close();
});