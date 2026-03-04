FROM ghcr.io/berriai/litellm:main-latest

# Copy config
COPY litellm_config.yaml /app/config.yaml

# LiteLLM listens on 4000 by default
EXPOSE 4000

# Start LiteLLM proxy with our config
CMD ["--config", "/app/config.yaml", "--port", "4000", "--host", "0.0.0.0"]
