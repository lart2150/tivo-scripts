'use strict'
import {Tivo} from './lib/tivo.js';
import {config} from './config.js';

const getTime = () => {
    return (new Date()).toLocaleTimeString('en-US');
}

const doit = async () => {
    let tivo = new Tivo(config.ip, config.mak);
    
    await tivo.connect();
    console.log('connected');
    
    const systemInformation = await tivo.systemInformation();
    console.log(systemInformation.programInfoTo);

    //less then 10 days in ms
    if ((Date.parse( systemInformation.programInfoTo) -Date.now()) < 86400000) {
        console.log(`Guide data is through ${systemInformation.programInfoTo}.  Rebooting.`)
        
        await tivo.reboot();
        await new Promise(resolve => setTimeout(resolve, 30000));//wait 30 seconds before we start trying to reconnect.  My bolt takes about 1:30
        do {
            console.log(getTime() + `: waiting tivo to boot up`);
            try {
                await tivo.connect();//connect timeout is about 20 seconds so we don't need additonal sleeps.
            } catch (e) {
                //console.log('not connected?', e);
            }
        } while (!tivo.isConnected());

        console.log(getTime() + ': Reconnected. Running first phone home');
        await tivo.phoneHome();
        let phoneHomeStatus = {};
        do {
            await new Promise(resolve => setTimeout(resolve, 4000));
            try {
                phoneHomeStatus = await tivo.phoneHomeStatus();
                //console.log('phoneHomeStatus', phoneHomeStatus);
                console.log(getTime()+ `: ${phoneHomeStatus.phase} - ${phoneHomeStatus.status}`)
            } catch (e) {
                console.log('sad face', e)
            }
        } while (phoneHomeStatus.phase !== 'succeeded');

        console.log(getTime() + ': running second phone home');
        await tivo.phoneHome();
        do {
            await new Promise(resolve => setTimeout(resolve, 4000));
            try {
                phoneHomeStatus = await tivo.phoneHomeStatus();
                //console.log('phoneHomeStatus', phoneHomeStatus);
                console.log(getTime() + `: ${phoneHomeStatus.phase} - ${phoneHomeStatus.status}`)
            } catch (e) {
                console.log('sad face', e)
            }
        } while (phoneHomeStatus.phase !== 'succeeded');
        console.log('finished')
        tivo.disconnect();
    }
    
    tivo.disconnect();
}

doit();