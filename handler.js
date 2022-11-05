'use strict';

const AWS = require('aws-sdk')
const { Client } = require('pg')
const copyTo = require('pg-copy-streams').to

const bucketName = process.env.BUCKET_NAME;
var backupFile = [];

AWS.config.update({
  s3ForcePathStyle: true,
  region: process.env.AWS_REGION,
})

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY ,
  secretAccessKey: process.env.AWS_ACCESS_SECRET,
})

async function s3Upload(inputStream, bucket, s3Key) {

  const params = {
      Bucket: bucket,
      Key: s3Key,
      Body: inputStream
  }
  const data = await s3.upload(params).promise()
  const { Location } = data
  return Location
}

async function s3Delete(filename, bucket) {

  const params = {
    Bucket: bucket,
    Key: filename
  }
  await s3.deleteObject(params).promise();

}


exports.backup = async function (event, context) {
  try {
    // se genera la conexion a la base de datos
    var pgClient = new Client({connectionString: process.env.DATABASE_URL});
    await pgClient.connect();
    
    // script sql que genera el respaldo
    const exportQuery = copyTo(
      `COPY (SELECT * FROM public.users,public.event) 
      TO STDOUT with (FORMAT CSV, DELIMITER ',', QUOTE '"', HEADER)`
    );

    // ruta de salida
    const nameProject = 'shokworks';
    const dbName = 'shokworks';
    const date = new Date();
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hour = date.getHours();
    const minutes = date.getMinutes();
    const seconds = date.getSeconds();
    const ext = 'csv';
    const outputDate = `${year}${month}${day}.${hour}${minutes}${seconds}`;

    const outputFile = `${nameProject}-${dbName}${outputDate}.${ext}`;//ruta del archivo

    // se ejectuta la consulta
    const readableStream = await pgClient.query(exportQuery);

    // Subida a s3
    await s3Upload(readableStream, bucketName, outputFile);

    // Se guarda los nombres de los archivos subidos en el array creado
    backupFile.push(outputFile);
    
    
    // condicion para limitar 15 respaldos maximos en s3

    if(backupFile.length === 16){
      const file = backupFile.shift();
      await s3Delete(file,bucketName);
    }

  } catch (err) {
    console.error('error=>',err.stack)
    throw Error(err.stack)
  } finally {
    //se cierra la conexion a la base de datos
    await pgClient.end()
  }
}

