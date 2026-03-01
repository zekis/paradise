FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends git openssh-client && \
    rm -rf /var/lib/apt/lists/*

# Install nanobot from local source (includes Moonshot reasoning_content fix)
COPY --from=nanobot-src . /tmp/nanobot-src
RUN pip install --no-cache-dir /tmp/nanobot-src websockets && rm -rf /tmp/nanobot-src

# Create default workspace and SSH directory with correct permissions
RUN mkdir -p /root/.nanobot/workspace /root/.ssh && chmod 700 /root/.ssh

COPY server.py /opt/paradise/server.py

EXPOSE 18790
CMD ["python", "/opt/paradise/server.py"]
