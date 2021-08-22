# TiVo Scripts

This is a library to talk to TiVo's RCP server along with a few scripts to preform some mundane tasks.

### autoDelete.js
`node autoDelete.js`

This script will peremently delete some deleted items.  It can be configured to mach on the name using either an exact match or a regular expression.  it can also delete duplicate deleted shows if they have the same title, subtitle, season, and episode number.

### download.js
`node download.js tivo:rc.12345678`

This script will download a recording and auto decode it using [tivodecode-ng](https://github.com/wmcbrine/tivodecode-ng/releases).  This script requires the node modules.

### fixOutOfDateGuide.js
`node fixOutOfDateGuide.js`

This script will look how long you have guide data.  if it's less then 10 days it will reboot your tivo and phone home twice.  I've had a few issues where my guide data was stale and required a reboot.

### getAllRecordings.js
`node getAllRecordings.js`

This is more an example/poc script that gets all of the recordings on a tive except for deleted recordings.  You can use it to get a recording id to download.

### getRecordingSkip.js
`node getRecordingSkip.js tivo:rc.12345678`

this will get the recording metadata, skip metadata, and skip data offset.  It will write the data to a file like "title SxE subtitle.txt"

you can then add the data to a recording you have downloaded using ffmpeg.

`ffmpeg -i "Title - 1x01 - sub title.ts" -i "Title - 1x01 - sub title.txt" -map_metadata 1 -c copy "Title - 1x01 - sub title.mkv"`


### getStatus.js
`node getStatus.js`

This is another more example/poc script.  It gets the status of the tivo using a few different calls.  

### phoneHomeAndWait.js
`node phoneHomeAndWait.js`

calls phone home and waits for it to finish before it exits.