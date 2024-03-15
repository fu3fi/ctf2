FROM ubuntu:20.04 
RUN apt-get update 
ARG DEBIAN_FRONTEND=noninteractive
RUN apt install -y php7.4
RUN apt install -y apache2 libapache2-mod-php7.4
RUN apt install -y screen
RUN apt install -y nano
RUN apt install -y openssh-server

RUN useradd -m -p $(perl -e 'print crypt($ARGV[0], "password")' '123') -s /bin/bash developer

RUN service ssh start
RUN service apache2 start
    

COPY ./Linux.log /var/www/html/
COPY ./JavaDoc.pdf /var/www/html/
COPY ./index.html /var/www/html/
COPY ./getLog.php /var/www/html/
COPY ./ssh.php /var/www/html/
COPY ./phpseclib1 /var/www/html/
RUN chmod -R 777 /var/www/html

EXPOSE 80

ENTRYPOINT service ssh restart && service apache2 start && bash