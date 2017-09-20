
const fs    = require( "fs" );
const path  = require('path');


function getSendBuf( cwd, send_data ) 
{
    const hexPrefix = "\\x";
    var hexPrefixLen = hexPrefix.length;

    const filePrefix = "file:";
    var filePrefixLen = filePrefix.length;  

    const fileHexPrefix = "filehex:";
    var fileHexPrefixLen = fileHexPrefix.length;

    var isHex = 
        send_data.length > hexPrefixLen && 
        send_data.indexOf( hexPrefix ) == 0 &&
        send_data.length % 2 == 0;

    var isFile = 
        send_data.length > filePrefixLen && 
        send_data.indexOf( filePrefix ) == 0

    var isFileHex = 
        send_data.length > fileHexPrefixLen && 
        send_data.indexOf( fileHexPrefix ) == 0


    if ( isHex )
    {
        send_buff = new Buffer( send_data.substr( hexPrefixLen ), "hex" );
    }
    else if ( isFile )
    {
        var filename = send_data.substr( filePrefixLen ).trim();

        filename = path.join( path.dirname( cwd ), filename );
        console.log( filename );

        if ( fs.existsSync( filename ) )
        {
            send_buff = new Buffer( fs.readFileSync( filename ) );
        }
        else
        {
            console.error( "file '%s' not found, exit.", filename );
            return null;
        }
    }
    else if ( isFileHex )
    {
        var filename = send_data.substr( fileHexPrefixLen ).trim();

        filename = path.join( path.dirname( cwd ), filename );
        console.log( filename );
        
        if ( fs.existsSync( filename ) )
        {
            send_buff = new Buffer( fs.readFileSync( filename, "utf-8"), "hex" );
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

    console.log( "send_buff (hex): '%s'", send_buff.toString( "hex" ) );
    console.log( "send_buff (str): '%s'", send_buff.toString( ) );
    
    return send_buff;
}


module.exports.getSendBuf = getSendBuf;